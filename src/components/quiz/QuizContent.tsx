import React, { useState } from 'react';
import { QuizQuestion } from '../../hooks/useCourseApi';
import { submitQuizResult } from '../../services/courseService';

interface QuizContentProps {
  questions: QuizQuestion[];
  onComplete: () => void;
  hasNextLesson?: boolean;
  onMoveToNextLesson?: () => void;
  lessonId: number;
}

export const QuizContent: React.FC<QuizContentProps> = ({ questions, onComplete, hasNextLesson = false, onMoveToNextLesson, lessonId }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnswerSelect = (answerIndex: number) => {
    setSelectedAnswers(prev => {
      const newAnswers = [...prev];
      newAnswers[currentQuestion] = answerIndex;
      return newAnswers;
    });
  };

  const handleNext = async () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      setSubmitting(true);
      setError(null);

      const score = calculateScore();
      console.log('Quiz completed with score:', score);
      
      try {
        await submitQuizResult({
          lessonId,
          score: score.percentage,
          notes: `Correct answers: ${score.correct}/${score.total}`
        });
        setShowResults(true);
      } catch (err: any) {
        setError(err.message || 'Failed to submit quiz results');
        console.error('Failed to submit quiz results:', err);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleComplete = () => {
    onComplete();
    if (hasNextLesson && onMoveToNextLesson) {
      onMoveToNextLesson();
    }
  };

  const handleViewAnswers = () => {
    setShowAnswers(true);
  };

  const calculateScore = () => {
    let correctAnswers = 0;
    selectedAnswers.forEach((selectedIndex, questionIndex) => {
      if (questions[questionIndex].answers[selectedIndex]?.isCorrect) {
        correctAnswers++;
      }
    });
    return {
      correct: correctAnswers,
      total: questions.length,
      percentage: Math.round((correctAnswers / questions.length) * 100)
    };
  };

  if (!questions.length) {
    return <div className="text-center text-gray-600">لا توجد أسئلة متاحة</div>;
  }

  const question = questions[currentQuestion];
  const score = showResults ? calculateScore() : null;

  const getAnswerStatusClass = (questionIndex: number, answerIndex: number) => {
    const isSelected = selectedAnswers[questionIndex] === answerIndex;
    const isCorrect = questions[questionIndex].answers[answerIndex].isCorrect;
    
    if (!isSelected && !isCorrect) return 'border-gray-200 text-gray-700';
    if (isSelected && isCorrect) return 'border-green-500 bg-green-50 text-green-700';
    if (isSelected && !isCorrect) return 'border-red-500 bg-red-50 text-red-700';
    if (!isSelected && isCorrect) return 'border-green-500 bg-green-50 text-green-700';
  };

  return (
    <div className="quiz-content" dir="rtl">
      {!showResults ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900">السؤال {currentQuestion + 1} من {questions.length}</h3>
            <span className="text-sm text-gray-600">
              {Math.round(((currentQuestion + 1) / questions.length) * 100)}% مكتمل
            </span>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <p className="text-lg text-gray-900 mb-6">{question.text}</p>
            <div className="space-y-3">
              {question.answers.map((answer, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(index)}
                  className={`w-full text-right p-4 rounded-lg border transition-all ${
                    selectedAnswers[currentQuestion] === index
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {answer.text}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg">
                <p className="text-sm">{error}</p>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleNext}
                disabled={selectedAnswers[currentQuestion] === undefined || submitting}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  selectedAnswers[currentQuestion] === undefined || submitting
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }`}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    جاري الإرسال...
                  </span>
                ) : currentQuestion < questions.length - 1 ? (
                  'السؤال التالي'
                ) : (
                  'إنهاء الاختبار'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className="mb-8">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">تم إكمال الاختبار!</h3>
            <p className="text-gray-600 mb-6">أحسنت! لقد أكملت جميع الأسئلة.</p>
            
            {score && (
              <div className="bg-gray-50 rounded-xl p-6 max-w-sm mx-auto mb-6">
                <div className="text-4xl font-bold text-primary mb-2">{score.correct} من {score.total}</div>
                <div className="text-gray-600">
                  <span className="font-medium text-gray-900">{score.correct}</span> إجابات صحيحة من{' '}
                  <span className="font-medium text-gray-900">{score.total}</span> أسئلة
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                  <div 
                    className="bg-primary h-2.5 rounded-full transition-all duration-1000" 
                    style={{ width: `${score.percentage}%` }}
                  ></div>
                </div>
              </div>
            )}

            {!showAnswers ? (
              <button
                onClick={handleViewAnswers}
                className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors mb-4 w-full max-w-sm mx-auto block"
              >
                عرض الإجابات الصحيحة
              </button>
            ) : (
              <div className="max-w-2xl mx-auto mt-8 space-y-6">
                <h4 className="text-xl font-semibold text-gray-900 mb-4">الإجابات الصحيحة</h4>
                {questions.map((q, qIndex) => (
                  <div key={qIndex} className="bg-white rounded-xl p-6 shadow-sm">
                    <p className="text-lg text-gray-900 mb-4 font-medium">{q.text}</p>
                    <div className="space-y-3">
                      {q.answers.map((answer, aIndex) => (
                        <div
                          key={aIndex}
                          className={`w-full text-right p-4 rounded-lg border transition-all flex items-center justify-between ${getAnswerStatusClass(qIndex, aIndex)}`}
                        >
                          <span>{answer.text}</span>
                          {answer.isCorrect && (
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {selectedAnswers[qIndex] === aIndex && !answer.isCorrect && (
                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4 max-w-sm mx-auto">
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleComplete}
            disabled={submitting}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              submitting
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                جاري الإرسال...
              </span>
            ) : hasNextLesson ? (
              'إنهاء والانتقال للدرس التالي'
            ) : (
              'إنهاء وعودة للدرس'
            )}
          </button>
        </div>
      )}
    </div>
  );
}; 