import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useUnitCode from '../../hooks/useUnitCode';
import { UnitLessonDto, LessonType } from '../../types/unit';
import ReactPlayer from 'react-player';
import { QuizContent } from '../quiz/QuizContent';
import axios from 'axios';
import { BASE_URL } from '../../apiConfig';
import useScrollToTop from '../../hooks/useScrollToTop';
import VideoWatermark from '../common/VideoWatermark';
import { getUserPhoneNumber } from '../../utils/userWatermark';
import { UnitLessonWithProgressDto } from '../../types/unit';
import UnitAccessTimer from '../common/UnitAccessTimer';

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

// Add this helper function at the top of the file
const isArabicText = (text: string): boolean => {
  const arabicPattern = /[\u0600-\u06FF]/;
  return arabicPattern.test(text);
};

// Function to check if URL is a Bunny.net embed
const isBunnyVideo = (url: string): boolean => {
  return url.includes('iframe.mediadelivery.net');
};

// Helper function to check if a unit is accessible based on enrollment date
const isUnitAccessible = (unitIndex: number, enrollmentDate: string): { accessible: boolean; message?: string; daysLeft?: number } => {
  if (!enrollmentDate) {
    return { accessible: false, message: 'تاريخ التسجيل غير متوفر' };
  }

  const enrollment = new Date(enrollmentDate);
  const now = new Date();
  const daysSinceEnrollment = Math.floor((now.getTime() - enrollment.getTime()) / (1000 * 60 * 60 * 24));
  
  // Each unit is accessible for 7 days
  const unitStartDay = unitIndex * 7;
  const unitEndDay = (unitIndex + 1) * 7;
  
  // Check if we're in the access period for this unit
  if (daysSinceEnrollment >= unitStartDay && daysSinceEnrollment < unitEndDay) {
    const daysLeft = unitEndDay - daysSinceEnrollment;
    return { accessible: true, daysLeft };
  }
  
  // Check if the unit period hasn't started yet
  if (daysSinceEnrollment < unitStartDay) {
    const daysUntilStart = unitStartDay - daysSinceEnrollment;
    return { 
      accessible: false, 
      message: `ستصبح هذه الوحدة متاحة خلال ${daysUntilStart} ${daysUntilStart === 1 ? 'يوم' : 'أيام'}` 
    };
  }
  
  // Unit access period has expired
  return { 
    accessible: false, 
    message: 'انتهت فترة الوصول لهذه الوحدة' 
  };
};

// Helper function to get unit access status message
const getUnitAccessStatus = (unitIndex: number, enrollmentDate: string): { message: string; style: string } => {
  const access = isUnitAccessible(unitIndex, enrollmentDate);
  
  if (access.accessible && access.daysLeft !== undefined) {
    if (access.daysLeft <= 2) {
      return {
        message: `متاحة - يتبقى ${access.daysLeft} ${access.daysLeft === 1 ? 'يوم' : 'أيام'}`,
        style: 'text-orange-600'
      };
    } else {
      return {
        message: `متاحة - يتبقى ${access.daysLeft} أيام`,
        style: 'text-green-600'
      };
    }
  } else if (access.message) {
    return {
      message: access.message,
      style: 'text-red-600'
    };
  }
  
  return {
    message: 'غير متاحة',
    style: 'text-red-600'
  };
};

const UnitViewer: React.FC = () => {
  useScrollToTop();
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const { 
    lessons: unitLessons, 
    unitDetails,
    lessonContent, 
    unitWithProgress,
    getUnitLessons, 
    getUnitWithProgress,
    getLessonContent, 
    isLoading, 
    error 
  } = useUnitCode();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeLesson, setActiveLesson] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<ReactPlayerType>(null);
  const [selectedLesson, setSelectedLesson] = useState<UnitLessonDto | UnitLessonWithProgressDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
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

  // Load unit lessons with progress
  useEffect(() => {
    const loadUnitWithProgress = async () => {
      if (unitId) {
        try {
          setLoading(true);
          await getUnitWithProgress(parseInt(unitId));
        } catch (err) {
          console.error('Error loading unit with progress:', err);
          setLoadingError('حدث خطأ أثناء تحميل دروس الوحدة');
        } finally {
          setLoading(false);
        }
      }
    };

    loadUnitWithProgress();
  }, [unitId, getUnitWithProgress]);

  // Handle lesson selection when lessons are loaded
  useEffect(() => {
    if (unitWithProgress && unitWithProgress.lessons && unitWithProgress.lessons.length > 0) {
      // Check unit access based on enrollment date
      // For now, we'll assume this is unit index 0 since we're viewing a single unit
      // In a full course context, you would pass the actual unit index
      const unitIndex = 0; // This should be passed as a prop or derived from context
      const accessStatus = isUnitAccessible(unitIndex, unitWithProgress.enrollmentDate);
      
      if (!accessStatus.accessible) {
        setLoadingError(accessStatus.message || 'الوحدة غير متاحة حالياً');
        return;
      }
      
      // Check for URL parameters
      const lessonParam = searchParams.get('lesson');
      
      if (lessonParam) {
        const lessonIndex = parseInt(lessonParam);
        
        if (!isNaN(lessonIndex) && lessonIndex >= 0 && lessonIndex < unitWithProgress.lessons.length) {
          // Check if the lesson is locked
          let lock = false;
          if (lessonIndex > 0) {
            const prevLesson = unitWithProgress.lessons[lessonIndex - 1];
            if (prevLesson.type === LessonType.Quiz && !prevLesson.isQuizSubmitted) {
              lock = true;
            }
          }
          
          if (!lock) {
            const lesson = unitWithProgress.lessons[lessonIndex];
            setActiveLesson(lessonIndex);
            setSelectedLesson(lesson);
            loadLessonContent(lesson.id);
          } else {
            // Find the first unlocked lesson
            findAndLoadFirstUnlockedLesson();
          }
        } else {
          // Find the first unlocked lesson
          findAndLoadFirstUnlockedLesson();
        }
      } else {
        // Find the first unlocked lesson
        findAndLoadFirstUnlockedLesson();
      }
    }
  }, [unitWithProgress, searchParams]);

  // Load lesson content
  const loadLessonContent = async (lessonId: number) => {
    setLoading(true);
    setLoadingError(null);

    try {
      await getLessonContent(lessonId);
    } catch (err) {
      console.error('Error loading lesson content:', err);
      setLoadingError('حدث خطأ أثناء تحميل محتوى الدرس');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to find and load the first unlocked lesson
  const findAndLoadFirstUnlockedLesson = async () => {
    if (!unitWithProgress?.lessons) return;

    // Find the first unlocked lesson
    let lock = false;
    for (let lessonIndex = 0; lessonIndex < unitWithProgress.lessons.length; lessonIndex++) {
      const lesson = unitWithProgress.lessons[lessonIndex];
      
      // Check if this lesson is locked
      if (lessonIndex > 0) {
        const prevLesson = unitWithProgress.lessons[lessonIndex - 1];
        if (prevLesson.type === LessonType.Quiz && !prevLesson.isQuizSubmitted) {
          lock = true;
        }
      }
      
      // If lesson is not locked, select it
      if (!lock) {
        setActiveLesson(lessonIndex);
        setSelectedLesson(lesson);
        await loadLessonContent(lesson.id);
        return;
      }
    }
    
    // If all lessons are locked, select the first one anyway
    if (unitWithProgress.lessons.length > 0) {
      setActiveLesson(0);
      setSelectedLesson(unitWithProgress.lessons[0]);
      await loadLessonContent(unitWithProgress.lessons[0].id);
    }
  };

  const handleLessonClick = async (lessonIndex: number) => {
    if (unitWithProgress && unitWithProgress.lessons && lessonIndex >= 0 && lessonIndex < unitWithProgress.lessons.length) {
      const lesson = unitWithProgress.lessons[lessonIndex];
      
      setSelectedLesson(lesson);
      setActiveLesson(lessonIndex);
      setIsMenuOpen(false);
      
      // Update URL
      searchParams.set('lesson', lessonIndex.toString());
      setSearchParams(searchParams);
      
      await loadLessonContent(lesson.id);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handlePlayPause = () => {
    setPlaying(!playing);
  };

  const handleProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
    setProgress(state.played * 100);
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

  const goToNextLesson = async () => {
    if (activeLesson !== null && unitWithProgress?.lessons && activeLesson < unitWithProgress.lessons.length - 1) {
      const nextLessonIndex = activeLesson + 1;
      await handleLessonClick(nextLessonIndex);
    }
  };

  const hasNextLesson = activeLesson !== null && unitWithProgress?.lessons && unitWithProgress.lessons.length > 0 && activeLesson < unitWithProgress.lessons.length - 1;

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || loadingError || !unitWithProgress || !unitWithProgress.lessons || !unitWithProgress.lessons.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">الوحدة غير متوفرة</h2>
          <p className="text-gray-600 mb-6">{loadingError || error || 'الوحدة التي تبحث عنها غير موجودة أو لا تحتوي على دروس.'}</p>
          <button 
            onClick={() => navigate('/my-lectures')}
            className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
          >
            العودة إلى محاضراتي
          </button>
        </div>
      </div>
    );
  }

  const currentLesson = selectedLesson;
  const currentLessonNumber = (activeLesson || 0) + 1;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <div className="bg-white shadow-sm border-b border-slate-200 fixed top-0 left-0 right-0 z-50">
        <div className="h-16 flex items-center justify-between px-4 lg:px-6 max-w-[1920px] mx-auto">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <button 
              onClick={() => navigate('/my-lectures')}
              className="p-2 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-2 text-slate-700"
              aria-label="Back to My Lectures"
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

          {/* Unit Title and Progress */}
          <div className="flex-1 mx-6 hidden sm:block">
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              {unitDetails && selectedLesson 
                ? `${unitDetails.unitName} - ${selectedLesson.lessonName}`
                : 'الوحدة'
              }
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {`الدرس ${currentLessonNumber} من ${unitLessons ? unitLessons.length : 0}`}
              </span>
            </div>
          </div>

          {/* Mobile Unit Title */}
          <div className="flex-1 mx-6 sm:hidden">
            <h1 className="text-base font-semibold text-slate-900 truncate">
              {unitDetails && selectedLesson 
                ? `${unitDetails.unitName} - ${selectedLesson.lessonName}`
                : 'الوحدة'
              }
            </h1>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="pt-16 min-h-screen flex">
        {/* Sidebar */}
        <aside 
          className={`fixed inset-y-0 left-0 z-40 w-full sm:w-80 bg-white shadow-lg transform
            ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} 
            transition-all duration-300 ease-in-out`}
          style={{ top: '4rem' }}
        >
          {/* Close button for mobile */}
          <button 
            onClick={toggleMenu}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 sm:hidden"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="h-full flex flex-col">
            {/* Unit Content Header */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">دروس الوحدة</h2>
                  <p className="text-sm text-slate-500">{`${unitWithProgress?.lessons ? unitWithProgress.lessons.length : 0} دروس`}</p>
                  {/* Show unit access status */}
                  {unitWithProgress?.enrollmentDate && (
                    <p className={`text-xs font-medium ${getUnitAccessStatus(0, unitWithProgress.enrollmentDate).style}`}>
                      {getUnitAccessStatus(0, unitWithProgress.enrollmentDate).message}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Unit Lessons List */}
            <div className="overflow-y-auto flex-1 py-4">
              <div className="space-y-1">
                {unitWithProgress?.lessons && (() => {
                  let lock = false;
                  return unitWithProgress.lessons.map((lesson, lessonIndex) => {
                    // If previous lesson is a quiz and not submitted, lock this and all next lessons
                    if (lessonIndex > 0) {
                      const prevLesson = unitWithProgress.lessons[lessonIndex - 1];
                      if (prevLesson.type === LessonType.Quiz && !prevLesson.isQuizSubmitted) {
                        lock = true;
                      }
                    }
                    const isLessonLocked = lock && !(activeLesson === lessonIndex);
                    
                    return (
                      <button
                        key={lesson.id}
                        className={`w-full px-6 py-3 flex items-center gap-3 transition-colors
                          ${activeLesson === lessonIndex 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : isLessonLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 text-slate-700'}`}
                        onClick={() => !isLessonLocked && handleLessonClick(lessonIndex)}
                        disabled={isLessonLocked}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center
                          ${activeLesson === lessonIndex 
                            ? 'bg-emerald-100' 
                            : 'bg-slate-100'}`}
                        >
                          {isLessonLocked ? (
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          ) : lesson.type === LessonType.Video ? (
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
                          <h4 className={`font-medium line-clamp-1 ${isLessonLocked ? 'text-gray-500' : 'text-current'}`}>
                            {lesson.lessonName}
                          </h4>
                          <div className="flex items-center gap-2 text-sm">
                            <span className={`${
                              activeLesson === lessonIndex 
                                ? 'text-emerald-600' 
                                : isLessonLocked ? 'text-gray-400' : 'text-slate-500'
                            }`}>
                              {lesson.type === LessonType.Video ? 'فيديو' : 'اختبار'}
                            </span>
                            {isLessonLocked && (
                              <span className="text-xs text-gray-400">مقفل</span>
                            )}
                            {/* Show lesson progress */}
                            {!isLessonLocked && lesson.type === LessonType.Video && lesson.isCompleted && (
                              <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                مكتمل
                              </span>
                            )}
                            {!isLessonLocked && lesson.type === LessonType.Quiz && lesson.isQuizSubmitted && (
                              <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                مُرسل
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 transition-all duration-300 ${isMenuOpen ? 'sm:ml-80' : 'ml-0'}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
              </div>
            ) : loadingError ? (
              <div className="text-center p-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{loadingError}</h3>
                <p className="text-slate-500">يرجى المحاولة مرة أخرى أو الاتصال بالدعم إذا استمرت المشكلة.</p>
              </div>
            ) : selectedLesson && lessonContent ? (
              <div className="space-y-6">
                {/* Unit Access Timer */}
                {unitWithProgress && (
                  <UnitAccessTimer 
                    unitIndex={unitWithProgress.order - 1} // Convert 1-based to 0-based index
                    enrollmentDate={unitWithProgress.enrollmentDate}
                    className="mb-6"
                  />
                )}
                
                {selectedLesson.type === LessonType.Video && lessonContent && 'videoUrl' in lessonContent && (
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
                            opacity={0.7}
                            speed={5}
                          />
                        )}
                        
                        {isBunnyVideo((lessonContent as any).videoUrl) ? (
                          <BunnyVideoPlayer
                            url={(lessonContent as any).videoUrl}
                            playing={playing}
                            onProgress={handleProgress}
                            onDuration={handleDuration}
                          />
                        ) : (
                          <>
                            <ReactPlayer
                              ref={playerRef}
                              url={(lessonContent as any).videoUrl}
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
                                    className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full transition-all duration-150 group-hover:bg-emerald-400"
                                    style={{ width: `${progress}%` }}
                                  />
                                  <div 
                                    className="absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-emerald-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
                                  />
                                </div>
                              
                                {/* Controls Bar */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <button
                                      onClick={handlePlayPause}
                                      className="text-white hover:text-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
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
                                        className="text-white hover:text-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
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
                                        className="w-0 group-hover:w-20 transition-all duration-200 opacity-0 group-hover:opacity-100 accent-emerald-500"
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
                                        className="text-white hover:text-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg flex items-center gap-2 px-3 py-1.5 bg-black/20"
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
                                                playbackSpeed === speed ? 'text-emerald-400 bg-emerald-500/10' : 'text-white'
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
                                      className="text-white hover:text-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
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
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Attachments section */}
                    {(lessonContent as any).attachmentUrl && (lessonContent as any).attachmentTitle && (
                      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/20 flex items-center justify-center">
                              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">مواد الدرس</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 text-sm">{(lessonContent as any).attachmentTitle}</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                  {(lessonContent as any).attachmentTitle.split('.').pop()?.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <a
                            href={(lessonContent as any).attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all duration-200"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            تحميل
                          </a>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {selectedLesson.type === LessonType.Quiz && Array.isArray(lessonContent) && (
                  <div className="bg-white rounded-2xl p-4 sm:p-8 shadow-lg">
                    <QuizContent
                      questions={lessonContent}
                      onComplete={() => {
                        setShowBravo(true);
                        setTimeout(() => {
                          setShowBravo(false);
                          if (hasNextLesson) {
                            goToNextLesson();
                          }
                        }, 2000);
                      }}
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

export default UnitViewer; 