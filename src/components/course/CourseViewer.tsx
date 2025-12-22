import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useScrollToTop from '../../hooks/useScrollToTop';
import { 
  useCourseApi, 
  CourseDetails, 
  Lesson,
  VideoLessonResponse,
  QuizLessonResponse 
} from '../../hooks/useCourseApi';
import ReactPlayer from 'react-player';
import { QuizContent } from '../quiz/QuizContent';
import axios from 'axios';
import { BASE_URL } from '../../apiConfig';
import VideoWatermark from '../common/VideoWatermark';
import { getUserPhoneNumber } from '../../utils/userWatermark';
import UnitAccessTimer from '../common/UnitAccessTimer';
import { getTenantHeaders } from '../../config/tenant';

// Add these color variables at the top of the file
const colors = {
  primary: '#2563EB', // Blue
  secondary: '#4F46E5', // Indigo
  accent: '#0EA5E9', // Sky blue
  success: '#22C55E', // Green
  background: '#F8FAFC', // Light gray
  text: {
    primary: '#1E293B', // Slate 800
    secondary: '#64748B', // Slate 500
    light: '#94A3B8' // Slate 400
  }
};

// Simplified screen orientation type
interface ScreenOrientationAPI {
  lock(orientation: 'landscape' | 'portrait'): Promise<void>;
  unlock(): void;
}

// Add type for ReactPlayer instance
type ReactPlayerType = ReactPlayer & {
  seekTo: (amount: number) => void;
};

interface BunnyVideoPlayerProps {
  url: string;
  playing: boolean;
  onProgress: (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => void;
  onDuration: (duration: number) => void;
}

// Bunny Video Player Component
const BunnyVideoPlayer: React.FC<BunnyVideoPlayerProps> = ({ url, playing, onProgress, onDuration }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const playerInterval = useRef<number | null>(null);
  
  // Setup message listener for communication with iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const data = event.data;
        
        // Handle duration info
        if (data.duration) {
          onDuration(data.duration);
        }
        
        // Handle progress updates
        if (data.currentTime && data.duration) {
          onProgress({ 
            played: data.currentTime / data.duration,
            playedSeconds: data.currentTime,
            loaded: 1, // Assume fully loaded
            loadedSeconds: data.duration
          });
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onDuration, onProgress]);

  // Control player with play/pause
  useEffect(() => {
    if (isLoaded && iframeRef.current) {
      const iframe = iframeRef.current;
      try {
        const message = playing ? { action: 'play' } : { action: 'pause' };
        iframe.contentWindow?.postMessage(message, '*');
      } catch (error) {
        console.error('Error controlling Bunny player:', error);
      }
    }
  }, [playing, isLoaded]);

  // Fallback progress tracking when postMessage is not available
  useEffect(() => {
    if (isLoaded && playing) {
      // Clear any existing interval
      if (playerInterval.current) {
        clearInterval(playerInterval.current);
      }
      
      // Set up progress tracking
      playerInterval.current = window.setInterval(() => {
        if (iframeRef.current) {
          // Try to get current time via postMessage
          iframeRef.current.contentWindow?.postMessage({ action: 'getCurrentTime' }, '*');
        }
      }, 1000);
    } else if (playerInterval.current) {
      clearInterval(playerInterval.current);
    }
    
    return () => {
      if (playerInterval.current) {
        clearInterval(playerInterval.current);
      }
    };
  }, [playing, isLoaded]);

  return (
    <iframe
      ref={iframeRef}
      src={url}
      className="w-full h-full absolute inset-0 border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title="Bunny Video Player"
      onLoad={() => setIsLoaded(true)}
    />
  );
};

// Add this CSS class for fullscreen video container
const videoContainerStyles = {
  fullscreen: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  }
};

// Add this helper function at the top of the file
const isArabicText = (text: string): boolean => {
  const arabicPattern = /[\u0600-\u06FF]/;
  return arabicPattern.test(text);
};

// Add this helper to clear course details cache
const clearCourseDetailsCache = (courseId: string) => {
  try {
    // The cache key must match the one used in useCourseApi
    const params = { courseid: courseId };
    const key = '/api/Course/tree-course-with-progress?' + new URLSearchParams(params as any).toString();
    // Note: Cache clearing is handled internally by useCourseApi
    // This function is kept for potential future use
  } catch (e) { /* ignore */ }
};

// Add these helper functions at the top of the component, after the existing helper functions

// Helper function to check if a unit is accessible based on enrollment date
const isUnitAccessible = (unitIndex: number, enrollmentDate: string, isOpenToAll: boolean): { accessible: boolean; message?: string; daysLeft?: number } => {
  // If course is open to all, all units are accessible
  if (isOpenToAll) {
    return { accessible: true };
  }

  if (!enrollmentDate) {
    return { accessible: false, message: 'تاريخ التسجيل غير متوفر' };
  }

  const enrollment = new Date(enrollmentDate);
  const now = new Date();
  const daysSinceEnrollment = Math.floor((now.getTime() - enrollment.getTime()) / (1000 * 60 * 60 * 24));
  
  // All units start from enrollment date (day 0)
  // Each unit ends at different times:
  // First unit (index 0): ends after 7 days
  // Second unit (index 1): ends after 14 days
  // Third unit (index 2): ends after 21 days, etc.
  const unitStartDay = 0; // All units start from enrollment date
  const unitEndDay = (unitIndex + 1) * 7; // Each unit ends after (unitIndex + 1) * 7 days
  
  // Check if we're in the access period for this unit
  if (daysSinceEnrollment >= unitStartDay && daysSinceEnrollment < unitEndDay) {
    const daysLeft = unitEndDay - daysSinceEnrollment;
    return { accessible: true, daysLeft };
  }
  
  // Check if unit period hasn't started yet (shouldn't happen since all start at day 0)
  if (daysSinceEnrollment < unitStartDay) {
    const daysUntilStart = unitStartDay - daysSinceEnrollment;
    return { 
      accessible: false, 
      message: `ستصبح هذه الوحدة متاحة خلال ${daysUntilStart} ${daysUntilStart === 1 ? 'يوم' : 'أيام'}` 
    };
  }
  
  // Unit period has ended
  return { 
    accessible: false, 
    message: 'انتهت فترة الوصول لهذه الوحدة' 
  };
};

// Helper function to get unit access status for display
// Function to check if a lesson should be locked due to unsubmitted quiz
const isLessonLockedByQuiz = (unitIndex: number, lessonIndex: number, courseData: CourseDetails | null): boolean => {
  if (!courseData) return false;
  
  const unit = courseData.units[unitIndex];
  if (!unit) return false;
  
  // Check if any previous lesson in this unit is a quiz that hasn't been submitted
  for (let i = 0; i < lessonIndex; i++) {
    const lesson = unit.lessons[i];
    if (lesson.type === 'Quiz' && !lesson.isQuizSubmitted) {
      return true;
    }
  }
  
  // Check if any previous unit has an unsubmitted quiz
  for (let prevUnitIndex = 0; prevUnitIndex < unitIndex; prevUnitIndex++) {
    const prevUnit = courseData.units[prevUnitIndex];
    for (const lesson of prevUnit.lessons) {
      if (lesson.type === 'Quiz' && !lesson.isQuizSubmitted) {
        return true;
      }
    }
  }
  
  return false;
};

// Function to check if a unit should be locked due to unsubmitted quiz
const isUnitLockedByQuiz = (unitIndex: number, courseData: CourseDetails | null): boolean => {
  if (!courseData) return false;
  
  // Check if any previous unit has an unsubmitted quiz
  for (let prevUnitIndex = 0; prevUnitIndex < unitIndex; prevUnitIndex++) {
    const prevUnit = courseData.units[prevUnitIndex];
    for (const lesson of prevUnit.lessons) {
      if (lesson.type === 'Quiz' && !lesson.isQuizSubmitted) {
        return true;
      }
    }
  }
  
  return false;
};

const getUnitAccessStatus = (unitIndex: number, enrollmentDate: string, isOpenToAll: boolean, courseData: CourseDetails | null) => {
  const status = isUnitAccessible(unitIndex, enrollmentDate, isOpenToAll);
  const quizLocked = isUnitLockedByQuiz(unitIndex, courseData);
  
  if (quizLocked) {
    return {
      accessible: false,
      statusText: 'Complete Previous Quiz',
      statusColor: 'text-orange-600'
    };
  }
  
  if (status.accessible && status.daysLeft !== undefined) {
    return {
      ...status,
      statusText: `متاحة (${status.daysLeft} ${status.daysLeft === 1 ? 'يوم متبقي' : 'أيام متبقية'})`,
      statusColor: status.daysLeft <= 2 ? 'text-orange-600' : 'text-green-600'
    };
  }
  
  if (status.accessible && isOpenToAll) {
    return {
      ...status,
      statusText: 'متاحة دائماً',
      statusColor: 'text-green-600'
    };
  }
  
  return {
    ...status,
    statusText: status.message || 'غير متاحة',
    statusColor: 'text-red-600'
  };
};

const CourseViewer: React.FC = () => {
  useScrollToTop();
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { fetchCourseDetails, isLoading, fetchLessonDetails } = useCourseApi();
  const [courseDetails, setCourseDetails] = useState<CourseDetails | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Sidebar collapsed by default
  const [activeUnit, setActiveUnit] = useState<number | null>(null);
  const [activeLesson, setActiveLesson] = useState<number | null>(null);
  const [collapsedUnits, setCollapsedUnits] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<ReactPlayerType>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [showCompleteButton, setShowCompleteButton] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [lessonDetails, setLessonDetails] = useState<VideoLessonResponse['data'] | QuizLessonResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showBravo, setShowBravo] = useState(false);
  const [userPhoneNumber, setUserPhoneNumber] = useState<string | null>(null);

  const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Function to show controls and set up auto-hide timer
  const showControlsTemporarily = () => {
    setControlsVisible(true);
    
    // Clear any existing timer
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    
    // Set up new timer to hide controls after 5 seconds
    controlsTimerRef.current = setTimeout(() => {
      // Only hide controls if video is playing
      if (playing) {
        setControlsVisible(false);
      }
    }, 5000);
  };

  // Reset controls visibility on play/pause
  useEffect(() => {
    if (playing) {
      showControlsTemporarily();
    } else {
      setControlsVisible(true);
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    }
  }, [playing]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  // Get user phone number for watermark
  useEffect(() => {
    const phoneNumber = getUserPhoneNumber();
    setUserPhoneNumber(phoneNumber);
  }, []);

  const handleLessonSelect = async (unitIndex: number, lessonIndex: number) => {
    if (!courseDetails) {
      console.error('No course details available');
      return;
    }

    const unit = courseDetails.units[unitIndex];
    if (!unit || !unit.lessons || lessonIndex >= unit.lessons.length) {
      console.error('Invalid unit or lesson index:', { unitIndex, lessonIndex, unit });
      setError('الدرس غير متوفر');
      return;
    }

    const lesson = unit.lessons[lessonIndex];
    console.log('Selected lesson:', lesson);
    
    if (lesson.type === 'Quiz') {
      console.log('Selected quiz with ID:', lesson.id);
    }
    
    setSelectedLesson(lesson);
    setActiveUnit(unitIndex);
    setActiveLesson(lessonIndex);
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching lesson details for lesson ID:', lesson.id);
      const response = await fetchLessonDetails(lesson.id);
      console.log('Lesson details response:', response);
      
      if (response?.success) {
        setLessonDetails(response.data);
      } else {
        console.error('Failed to load lesson details:', response);
        setError('فشل في تحميل تفاصيل الدرس');
      }
    } catch (err) {
      console.error('Error loading lesson:', err);
      setError('حدث خطأ أثناء تحميل الدرس');
    } finally {
      setLoading(false);
    }

    // Update URL parameters
    searchParams.set('unit', unitIndex.toString());
    searchParams.set('lesson', lessonIndex.toString());
    setSearchParams(searchParams);
  };

  // Helper function to find and load the first available lesson
 const findAndLoadFirstLesson = async (courseData: CourseDetails) => {
  const allLessons: { unitIndex: number; lessonIndex: number; lesson: Lesson }[] = [];

  // Flatten all lessons with their indices, but only from accessible units
  courseData.units.forEach((unit, unitIndex) => {
    const unitAccess = isUnitAccessible(unitIndex, courseData.enrollmentDate, courseData.isOpenToAll);
    if (unitAccess.accessible) {
      unit.lessons.forEach((lesson, lessonIndex) => {
        allLessons.push({ unitIndex, lessonIndex, lesson });
      });
    }
  });

  // If no accessible lessons, find the first accessible unit and show message
  if (allLessons.length === 0) {
    for (let unitIndex = 0; unitIndex < courseData.units.length; unitIndex++) {
      const unitAccess = isUnitAccessible(unitIndex, courseData.enrollmentDate, courseData.isOpenToAll);
      if (unitAccess.message) {
        setError(unitAccess.message);
        return;
      }
    }
    setError('لا توجد وحدات متاحة حالياً');
    return;
  }

  // Check if all accessible lessons are completed
  const allCompleted = allLessons.every(({ lesson }) => 
    (lesson.type === 'Video' && lesson.isCompleted) || 
    (lesson.type === 'Quiz' && lesson.isQuizSubmitted)
  );

  // If all accessible lessons are completed, load the first accessible lesson
  if (allCompleted && allLessons.length > 0) {
    const { unitIndex, lessonIndex, lesson } = allLessons[0];
    setActiveUnit(unitIndex);
    setActiveLesson(lessonIndex);
    setSelectedLesson(lesson);
    await loadLessonDetails(lesson.id);
    navigate(`/course-player/${courseId}?unit=${unitIndex}&lesson=${lessonIndex}`, { replace: true });
    return;
  }

  // Find the last completed lesson (video or quiz) among accessible lessons
  let lastCompletedIdx = -1;
  for (let i = 0; i < allLessons.length; i++) {
    const { lesson } = allLessons[i];
    if ((lesson.type === 'Video' && lesson.isCompleted) || (lesson.type === 'Quiz' && lesson.isQuizSubmitted)) {
      lastCompletedIdx = i;
    }
  }

  // Try to load the next lesson after the last completed
  const nextIndex = lastCompletedIdx + 1;
  if (nextIndex < allLessons.length) {
    const { unitIndex, lessonIndex, lesson } = allLessons[nextIndex];

    // Check if lesson is locked by quiz
    if (!isLessonLockedByQuiz(unitIndex, lessonIndex, courseData)) {
      setActiveUnit(unitIndex);
      setActiveLesson(lessonIndex);
      setSelectedLesson(lesson);
      await loadLessonDetails(lesson.id);
      navigate(`/course-player/${courseId}?unit=${unitIndex}&lesson=${lessonIndex}`, { replace: true });
      return;
    }
  }

  // Fallback: first available unlocked, not completed lesson among accessible lessons
  for (let i = 0; i < allLessons.length; i++) {
    const { unitIndex, lessonIndex, lesson } = allLessons[i];

    if (
      !isLessonLockedByQuiz(unitIndex, lessonIndex, courseData) &&
      ((lesson.type === 'Video' && !lesson.isCompleted) || (lesson.type === 'Quiz' && !lesson.isQuizSubmitted))
    ) {
      setActiveUnit(unitIndex);
      setActiveLesson(lessonIndex);
      setSelectedLesson(lesson);
      await loadLessonDetails(lesson.id);
      navigate(`/course-player/${courseId}?unit=${unitIndex}&lesson=${lessonIndex}`, { replace: true });
      return;
    }
  }

  // Check if the first lesson is a quiz that hasn't been submitted
  if (allLessons.length > 0) {
    const { unitIndex, lessonIndex, lesson } = allLessons[0];
    if (lesson.type === 'Quiz' && !lesson.isQuizSubmitted) {
      // Load the quiz but show a message that it needs to be completed first
      setActiveUnit(unitIndex);
      setActiveLesson(lessonIndex);
      setSelectedLesson(lesson);
      await loadLessonDetails(lesson.id);
      navigate(`/course-player/${courseId}?unit=${unitIndex}&lesson=${lessonIndex}`, { replace: true });
      return;
    }
  }

  // Final fallback: if no incomplete lessons found, load the first accessible lesson
  if (allLessons.length > 0) {
    const { unitIndex, lessonIndex, lesson } = allLessons[0];
    setActiveUnit(unitIndex);
    setActiveLesson(lessonIndex);
    setSelectedLesson(lesson);
    await loadLessonDetails(lesson.id);
    navigate(`/course-player/${courseId}?unit=${unitIndex}&lesson=${lessonIndex}`, { replace: true });
    return;
  }

  // Nothing available
  setError('لا توجد دروس متاحة حالياً');
};

  // Separate function to load lesson details
  const loadLessonDetails = async (lessonId: number) => {
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching lesson details for lesson ID:', lessonId);
      const response = await fetchLessonDetails(lessonId);
      console.log('Lesson details response:', response);
      
      if (response?.success) {
        setLessonDetails(response.data);
      } else {
        console.error('Failed to load lesson details:', response);
        setError('فشل في تحميل تفاصيل الدرس');
      }
    } catch (err) {
      console.error('Error loading lesson:', err);
      setError('حدث خطأ أثناء تحميل الدرس');
    } finally {
      setLoading(false);
    }
  };

  // Load course details and initialize first lesson
  useEffect(() => {
    const loadCourseDetails = async () => {
      if (courseId) {
        try {
          console.log('Loading course details for ID:', courseId);
          setLoading(true);
          const response = await fetchCourseDetails(courseId);
          console.log('Course details response:', response);

          if (response?.success) {
            setCourseDetails(response.data);
            
            // Check for URL parameters
            const unitParam = searchParams.get('unit');
            const lessonParam = searchParams.get('lesson');
            
            if (unitParam && lessonParam) {
              const unitIndex = parseInt(unitParam);
              const lessonIndex = parseInt(lessonParam);
              
              console.log('URL parameters found:', { unitIndex, lessonIndex });
              
              if (!isNaN(unitIndex) && !isNaN(lessonIndex) && 
                  unitIndex >= 0 && unitIndex < response.data.units.length &&
                  lessonIndex >= 0 && 
                  response.data.units[unitIndex].lessons &&
                  lessonIndex < response.data.units[unitIndex].lessons.length) {
                console.log('Loading lesson from URL parameters');
                const lesson = response.data.units[unitIndex].lessons[lessonIndex];
                setActiveUnit(unitIndex);
                setActiveLesson(lessonIndex);
                setSelectedLesson(lesson);
                await loadLessonDetails(lesson.id);
              } else {
                console.log('Invalid URL parameters, finding first lesson');
                await findAndLoadFirstLesson(response.data);
              }
            } else {
              console.log('No URL parameters, finding first lesson');
              await findAndLoadFirstLesson(response.data);
            }
          } else {
            console.error('Failed to load course details:', response);
            setError('فشل في تحميل تفاصيل الدورة');
          }
        } catch (err) {
          console.error('Error loading course:', err);
          setError('حدث خطأ أثناء تحميل الدورة');
        } finally {
          setLoading(false);
        }
      }
    };

    loadCourseDetails();
  }, [courseId]);

  useEffect(() => {
    if (courseDetails) {
      const saved = localStorage.getItem(`course_${courseDetails.id}_completed`);
      if (saved) {
        setCompletedLessons(JSON.parse(saved));
      }
    }
  }, [courseDetails]);

  const toggleUnit = (unitId: string) => {
    setCollapsedUnits(prev => 
      prev.includes(unitId) 
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  const handleLessonClick = async (unitIndex: number, lessonIndex: number) => {
    if (!courseDetails) {
      console.error('No course details available');
      return;
    }

    // Check if lesson is locked by quiz
    if (isLessonLockedByQuiz(unitIndex, lessonIndex, courseDetails)) {
      setError('يجب إكمال الاختبار السابق أولاً');
      return;
    }

    // Check if unit is accessible
    const unitAccess = isUnitAccessible(unitIndex, courseDetails.enrollmentDate, courseDetails.isOpenToAll);
    if (!unitAccess.accessible) {
      setError(unitAccess.message || 'هذه الوحدة غير متاحة حالياً');
      return;
    }

    const unit = courseDetails.units[unitIndex];
    if (!unit || !unit.lessons || lessonIndex >= unit.lessons.length) {
      console.error('Invalid unit or lesson index:', { unitIndex, lessonIndex, unit });
      setError('الدرس غير متوفر');
      return;
    }

    const lesson = unit.lessons[lessonIndex];
    console.log('Selected lesson:', lesson);
    
    setSelectedLesson(lesson);
    setActiveUnit(unitIndex);
    setActiveLesson(lessonIndex);
    setIsMenuOpen(false);
    setError(null); // Clear any previous errors
    
    // Update URL and load lesson details
    searchParams.set('unit', unitIndex.toString());
    searchParams.set('lesson', lessonIndex.toString());
    setSearchParams(searchParams);
    
    await loadLessonDetails(lesson.id);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handlePlayPause = () => {
    setPlaying(!playing);
  };

  const handleProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
    setProgress(state.played * 100);
    if (state.played > 0.9 && selectedLesson && !completedLessons.includes(selectedLesson.id.toString())) {
      setShowCompleteButton(true);
    }
  };

  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const width = bounds.width;
    const percentage = (x / width) * 100;
    setProgress(percentage);
    if (playerRef.current) {
      playerRef.current.seekTo(percentage / 100);
    }
  };

  const formatTime = (seconds: number) => {
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh) {
      return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  const calculateProgress = () => {
    if (!courseDetails || !courseDetails.units) return 0;
    const totalLessons = courseDetails.units.reduce((total, unit) => total + unit.lessons.length, 0);
    const completed = completedLessons.length;
    return (completed / totalLessons) * 100;
  };

  const handleLessonComplete = () => {
    if (!courseDetails || !selectedLesson) return;
    
    setCompletedLessons(prev => {
      const lessonId = selectedLesson.id.toString();
      if (!prev.includes(lessonId)) {
        const newCompleted = [...prev, lessonId];
        localStorage.setItem(`course_${courseDetails.id}_completed`, JSON.stringify(newCompleted));
        return newCompleted;
      }
      return prev;
    });

    if (hasNextLesson) {
      goToNextLesson();
    }
  };

  // Type guard to check if lesson details is video lesson response
  const isVideoLessonResponse = (details: VideoLessonResponse['data'] | QuizLessonResponse['data']): details is VideoLessonResponse['data'] => {
    return 'videoUrl' in details;
  };

  // Function to check if URL is a Bunny.net embed
  const isBunnyVideo = (url: string): boolean => {
    return url.includes('iframe.mediadelivery.net');
  };

  // Update the handleFullscreen function
  const handleFullscreen = async () => {
    if (!videoContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        if (videoContainerRef.current.requestFullscreen) {
          await videoContainerRef.current.requestFullscreen();
        } else if ((videoContainerRef.current as any).webkitRequestFullscreen) {
          await (videoContainerRef.current as any).webkitRequestFullscreen();
        }
        
        setIsFullscreen(true);

        // Check if it's a mobile device
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
          // Force landscape orientation
          if ('orientation' in window.screen && 'lock' in window.screen.orientation) {
            try {
              await (window.screen.orientation as any).lock('landscape');
              setIsLandscape(true);
            } catch (error) {
              console.log('Failed to lock orientation:', error);
            }
          }
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        
        setIsFullscreen(false);

        // Release orientation lock
        if ('orientation' in window.screen && 'unlock' in window.screen.orientation) {
          try {
            (window.screen.orientation as any).unlock();
            setIsLandscape(false);
          } catch (error) {
            console.log('Failed to unlock orientation:', error);
          }
        }
      }
    } catch (error) {
      console.log('Fullscreen error:', error);
    }
  };

  // Add fullscreen change event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        setIsLandscape(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (playerRef.current) {
      (playerRef.current as any).player.player.setVolume(newVolume * 100);
    }
  };

  // Handle mute toggle
  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (playerRef.current) {
      if (!isMuted) {
        (playerRef.current as any).player.player.setVolume(0);
      } else {
        (playerRef.current as any).player.player.setVolume(volume * 100);
      }
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
    if (playerRef.current) {
      (playerRef.current as any).player.player.setPlaybackRate(speed);
    }
  };

  useEffect(() => {
    if (selectedLesson?.type === 'Quiz') {
      console.log('Selected quiz lesson with ID:', selectedLesson.id);
    }
  }, [selectedLesson]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !courseDetails || activeUnit === null || activeLesson === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Course Not Found</h2>
          <p className="text-gray-600 mb-6">The course you're looking for doesn't seem to exist.</p>
          <button 
            onClick={() => navigate('/enrolled-courses')}
            className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
          >
            Back to My Courses
          </button>
        </div>
      </div>
    );
  }

  const currentUnit = courseDetails.units[activeUnit];
  const currentLesson = currentUnit?.lessons[activeLesson];

  // Add safety check for currentUnit and currentLesson
  if (!currentUnit || !currentLesson) {
    setActiveUnit(0);
    setActiveLesson(0);
    return null;
  }

  const totalLessons = courseDetails.units.reduce((total, unit) => total + unit.lessons.length, 0);
  const currentLessonNumber = courseDetails.units.slice(0, activeUnit).reduce((total, unit) => total + unit.lessons.length, 0) + activeLesson + 1;

  const goToNextLesson = async () => {
    if (activeLesson < currentUnit.lessons.length - 1) {
      // Next lesson in same unit
      const nextLessonIndex = activeLesson + 1;
      await handleLessonSelect(activeUnit, nextLessonIndex);
    } else if (activeUnit < courseDetails.units.length - 1) {
      // First lesson of next unit
      const nextUnitIndex = activeUnit + 1;
      await handleLessonSelect(nextUnitIndex, 0);
    }
  };

  const hasNextLesson = activeLesson < currentUnit.lessons.length - 1 || activeUnit < courseDetails.units.length - 1;

  const markLessonAsCompleted = async (lessonId: number) => {
    // Update local state without API call
    if (selectedLesson && selectedLesson.id === lessonId && selectedLesson.type === 'Video') {
      setSelectedLesson({ ...selectedLesson, isCompleted: true });
    }
    
    // Add to completed lessons locally
    setCompletedLessons(prev => {
      const lessonIdStr = lessonId.toString();
      if (!prev.includes(lessonIdStr)) {
        const newCompleted = [...prev, lessonIdStr];
        localStorage.setItem(`course_${courseId}_completed`, JSON.stringify(newCompleted));
        return newCompleted;
      }
      return prev;
    });
    
    // Show success message
    setShowBravo(true);
    setTimeout(async () => {
      setShowBravo(false);
      if (hasNextLesson) {
        await goToNextLesson();
      } else {
        window.location.reload();
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <div className="bg-white shadow-sm border-b border-slate-200 fixed top-0 left-0 right-0 z-50">
        <div className="h-16 flex items-center justify-between px-4 lg:px-6 max-w-[1920px] mx-auto">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <button 
              onClick={() => navigate('/enrolled-courses')}
              className="p-2 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-2 text-slate-700"
              aria-label="Back to Courses"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            {/* Menu Button */}
            <button 
              onClick={toggleMenu}
              className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
              aria-label={isMenuOpen ? 'Close Menu' : 'Open Menu'}
            >
              <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Course Title and Progress */}
          <div className="flex-1 mx-6 hidden sm:block">
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              {courseDetails?.courseName}
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {`${currentLessonNumber} / ${totalLessons}`}
              </span>
              <div className="h-4 w-px bg-slate-200"></div>
              <span className="text-blue-600 font-medium">{calculateProgress().toFixed(0)}% Complete</span>
            </div>
          </div>

          {/* Mobile Course Title */}
          <div className="flex-1 mx-6 sm:hidden">
            <h1 className="text-base font-semibold text-slate-900 truncate">
              {courseDetails?.courseName}
            </h1>
          </div>

          {/* Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
            <div 
              className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
              style={{ width: `${calculateProgress()}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="pt-16 min-h-screen flex">
        {/* Sidebar - Make it a modal on mobile */}
        <aside 
          className={`fixed inset-y-0 left-0 z-40 w-full sm:w-80 bg-white shadow-lg transform
            ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} 
            transition-all duration-300 ease-in-out`}
          style={{ top: '4rem' }}
        >
          {/* Add close button for mobile */}
          <button 
            onClick={toggleMenu}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 sm:hidden"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Rest of the sidebar content */}
          <div className="h-full flex flex-col">
            {/* Course Content Header */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">محاضرات الباقة</h2>
                  <p className="text-sm text-slate-500">{`${courseDetails?.units.length} Units • ${totalLessons} Lessons`}</p>
                </div>
              </div>
            </div>
            
            {/* Course Units List */}
            <div className="overflow-y-auto flex-1 py-4">
              {courseDetails?.units.map((unit, unitIndex) => {
                const unitAccess = getUnitAccessStatus(unitIndex, courseDetails.enrollmentDate, courseDetails.isOpenToAll, courseDetails);
                const isUnitLocked = !unitAccess.accessible;
                
                return (
                  <div key={unit.id} className="mb-4">
                    <button
                      className={`w-full px-6 py-3 flex items-center gap-3 transition-colors
                        ${isUnitLocked 
                          ? 'opacity-60 cursor-not-allowed bg-gray-50' 
                          : 'hover:bg-slate-50'}`}
                      onClick={() => !isUnitLocked && toggleUnit(unit.id.toString())}
                      disabled={isUnitLocked}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center
                        ${isUnitLocked 
                          ? 'bg-gray-200' 
                          : 'bg-gradient-to-br from-blue-500/10 to-blue-600/20'}`}
                      >
                        {isUnitLocked ? (
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        ) : (
                          <span className="text-blue-700 text-sm font-medium">{unitIndex + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className={`font-medium ${isUnitLocked ? 'text-gray-500' : 'text-slate-900'}`}>
                          {unit.unitName}
                        </h3>
                        <div className="flex items-center justify-between">
                          <p className={`text-sm ${isUnitLocked ? 'text-gray-400' : 'text-slate-500'}`}>
                            {`${unit.lessons.length} Lessons`}
                          </p>
                          <span className={`text-xs font-medium ${unitAccess.statusColor}`}>
                            {unitAccess.statusText}
                          </span>
                        </div>
                      </div>
                      {!isUnitLocked && (
                        <svg 
                          className={`w-5 h-5 text-slate-400 transition-transform ${collapsedUnits.includes(unit.id.toString()) ? '' : 'rotate-180'}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                    
                    {!isUnitLocked && (
                      <div className={`space-y-1 mt-1 ${collapsedUnits.includes(unit.id.toString()) ? 'hidden' : ''}`}>
                        {(() => {
                          return unit.lessons.map((lesson, lessonIndex) => {
                            const isLessonLocked = isLessonLockedByQuiz(unitIndex, lessonIndex, courseDetails) && 
                              !(activeUnit === unitIndex && activeLesson === lessonIndex);
                            
                            return (
                              <button
                                key={lesson.id}
                                className={`w-full px-6 py-3 flex items-center gap-3 transition-colors
                                  ${activeUnit === unitIndex && activeLesson === lessonIndex 
                                    ? 'bg-blue-50 text-blue-700' 
                                    : isLessonLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 text-slate-700'}`}
                                onClick={() => !isLessonLocked && handleLessonClick(unitIndex, lessonIndex)}
                                disabled={isLessonLocked}
                              >
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center
                                  ${activeUnit === unitIndex && activeLesson === lessonIndex 
                                    ? 'bg-blue-100' 
                                    : 'bg-slate-100'}`}
                                >
                                  {lesson.type === 'Video' && lesson.isCompleted ? (
                                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : lesson.type === 'Video' ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1 text-left">
                                  <h4 className="font-medium text-current line-clamp-1">{lesson.lessonName}</h4>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className={activeUnit === unitIndex && activeLesson === lessonIndex 
                                      ? 'text-blue-600' 
                                      : 'text-slate-500'}>
                                      {lesson.type === 'Video' ? 'Video Lesson' : 'Quiz'}
                                    </span>
                                    {completedLessons.includes(lesson.id.toString()) && (
                                      <>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-green-600">Completed</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Content - Adjust margin for mobile */}
        <main className={`flex-1 transition-all duration-300 ${isMenuOpen ? 'sm:ml-80' : 'ml-0'}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : error ? (
              <div className="text-center p-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{error}</h3>
                <p className="text-slate-500">Please try again or contact support if the problem persists.</p>
              </div>
            ) : selectedLesson && lessonDetails ? (
              <div className="space-y-6">
                {/* Unit Access Timer - Only show if course is not open to all */}
                {courseDetails && activeUnit !== null && !courseDetails.isOpenToAll && (
                  <UnitAccessTimer 
                    unitIndex={activeUnit}
                    enrollmentDate={courseDetails.enrollmentDate}
                    totalUnits={courseDetails.units.length}
                    className="mb-6"
                  />
                )}
                
                {selectedLesson.type === 'Video' && isVideoLessonResponse(lessonDetails) && (
                  <>
                    <div 
                      ref={videoContainerRef}
                      className={`video-container relative rounded-2xl overflow-hidden shadow-lg
                        ${isFullscreen ? 'fixed inset-0 z-50 bg-black' : ''}`}
                      onMouseMove={showControlsTemporarily}
                      onClick={showControlsTemporarily}
                    >
                      <div className={`${isFullscreen ? 'h-full' : 'aspect-video'} bg-slate-900`}>
                        {/* Floating Watermark */}
                        {userPhoneNumber && (
                          <VideoWatermark 
                            phoneNumber={userPhoneNumber} 
                            isVisible={true}
                            opacity={0.2}
                            speed={300}
                          />
                        )}
                        
                        {isBunnyVideo(lessonDetails.videoUrl) ? (
                          <BunnyVideoPlayer
                            url={lessonDetails.videoUrl}
                            playing={playing}
                            onProgress={handleProgress}
                            onDuration={handleDuration}
                          />
                        ) : (
                          <>
                            <ReactPlayer
                              ref={playerRef}
                              url={lessonDetails.videoUrl}
                              width="100%"
                              height="100%"
                              playing={playing}
                              controls={false}
                              playbackRate={playbackSpeed}
                              onProgress={handleProgress}
                              onDuration={handleDuration}
                            />
                            
                            {/* Custom Video Controls */}
                            <div 
                              className={`absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-300 ${
                                controlsVisible ? 'opacity-100' : 'opacity-0'
                              }`}
                            >
                              <div 
                                className="absolute inset-0 z-10 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePlayPause();
                                  showControlsTemporarily();
                                }}
                              />
                              
                              <div className={`absolute bottom-0 left-0 right-0 p-4 z-20 transition-opacity duration-300 ${
                                controlsVisible ? 'opacity-100' : 'opacity-0'
                              }`}>
                                <div 
                                  className="relative w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer group"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSeek(e);
                                    showControlsTemporarily();
                                  }}
                                >
                                  <div 
                                    className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all duration-150 group-hover:bg-blue-400"
                                    style={{ width: `${progress}%` }}
                                  />
                                  {/* Add hover effect preview dot */}
                                  <div 
                                    className="absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
                                  />
                                </div>
                              
                                {/* Controls Bar */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <button
                                      onClick={handlePlayPause}
                                      className="text-white hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
                                    >
                                      {playing ? (
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                      ) : (
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                      )}
                                    </button>

                                    <div className="flex items-center gap-2 group relative">
                                      <button
                                        onClick={handleMuteToggle}
                                        className="text-white hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
                                      >
                                        {isMuted || volume === 0 ? (
                                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                          </svg>
                                        ) : (
                                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 11.646a2 2 0 010 2.828m-4.95-7.778l4.95 4.95m0 0l4.95 4.95" />
                                          </svg>
                                        )}
                                      </button>
                                      <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={volume}
                                        onChange={handleVolumeChange}
                                        className="w-0 group-hover:w-20 transition-all duration-200 opacity-0 group-hover:opacity-100 accent-blue-500"
                                      />
                                    </div>

                                    <span className="text-white text-sm font-medium">
                                      {formatTime(duration * progress / 100)} / {formatTime(duration)}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-8">
                                    <div className="relative group">
                                      <button
                                        onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                                        className="text-white hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg flex items-center gap-2 px-3 py-1.5 bg-black/20"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span className="text-sm font-medium">{playbackSpeed}x</span>
                                      </button>

                                      {showSpeedMenu && (
                                        <div 
                                          className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-xl py-2 min-w-[100px] shadow-lg backdrop-blur-sm border border-white/10 transform origin-bottom-right z-50"
                                        >
                                          {playbackSpeeds.map((speed) => (
                                            <button
                                              key={speed}
                                              onClick={() => handleSpeedChange(speed)}
                                              className={`w-full px-4 py-1.5 text-left text-sm hover:bg-white/10 transition-colors flex items-center justify-between ${
                                                playbackSpeed === speed ? 'text-blue-400 bg-blue-500/10' : 'text-white'
                                              }`}
                                            >
                                              <span>{speed}x</span>
                                              {playbackSpeed === speed && (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                              )}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      onClick={handleFullscreen}
                                      className="text-white hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
                                    >
                                      {isFullscreen ? (
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6v6H9z" />
                                        </svg>
                                      ) : (
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                        </svg>
                                      )}
                                    </button>

                                  {showCompleteButton && !completedLessons.includes(selectedLesson.id.toString()) && (
                                    <button
                                      onClick={handleLessonComplete}
                                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                        {hasNextLesson ? 'Complete & Continue' : 'Complete Lesson'}
                                    </button>
                                  )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {selectedLesson.type === 'Video' && !selectedLesson.isCompleted && (
                      <div className="mt-4 flex justify-center">
                        <button
                          onClick={() => markLessonAsCompleted(selectedLesson.id)}
                          className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold shadow hover:bg-green-700 transition"
                        >
                          أتفرجت على المحاضرة
                        </button>
                      </div>
                    )}

                    {/* Make attachments section responsive */}
                    {lessonDetails.attachmentUrl && lessonDetails.attachmentTitle && (
                      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/20 flex items-center justify-center">
                              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">Course Materials</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 text-sm">{lessonDetails.attachmentTitle}</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {lessonDetails.attachmentTitle.split('.').pop()?.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <a
                            href={lessonDetails.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all duration-200"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </a>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {selectedLesson.type === 'Quiz' && Array.isArray(lessonDetails) && (
                  <div className="bg-white rounded-2xl p-4 sm:p-8 shadow-lg">
                    <QuizContent
                      questions={lessonDetails}
                      onComplete={handleLessonComplete}
                      hasNextLesson={hasNextLesson}
                      onMoveToNextLesson={goToNextLesson}
                      lessonId={selectedLesson.id}
                      isQuizSubmitted={selectedLesson.isQuizSubmitted}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {/* Add overlay for mobile menu */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 sm:hidden"
          onClick={toggleMenu}
        />
      )}
      {showBravo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-lg px-10 py-8 text-3xl font-bold text-green-600 animate-bounce">
            برافوووو 🎉
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseViewer; 