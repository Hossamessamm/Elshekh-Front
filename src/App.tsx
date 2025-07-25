import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CourseProvider } from './contexts/CourseContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';

// Pages
import Home from './pages/Home';
import About from './pages/About';
import ForgotPassword from './pages/ForgotPassword';

// Components
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ResetPassword from './components/auth/ResetPassword';
import Profile from './components/user/Profile';
import EnrolledCourses from './components/user/EnrolledCourses';
import CourseDetail from './components/course/CourseDetail';
import CourseViewer from './components/course/CourseViewer';
import RefreshTokenTest from './components/test/RefreshTokenTest';
import MyLectures from './pages/MyLectures';
import UnitViewer from './components/unit/UnitViewer';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ThemeProvider>
          <AuthProvider>
            <CourseProvider>
              <div className="min-h-screen bg-slate-50">
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    
                    {/* Protected Routes */}
                    <Route path="/profile" element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    } />
                                                    <Route path="/my-lectures" element={
                      <ProtectedRoute>
                        <MyLectures />
                      </ProtectedRoute>
                    } />
                    <Route path="/enrolled-courses" element={
                      <ProtectedRoute>
                        <EnrolledCourses />
                      </ProtectedRoute>
                    } />
                    <Route path="/courses/:id" element={<CourseDetail />} />
                    {/* Test Route */}
                    <Route path="/test-refresh-token" element={
                      <ProtectedRoute>
                        <RefreshTokenTest />
                      </ProtectedRoute>
                    } />
                  </Route>
                  {/* CourseViewer without MainLayout (no Navbar/Footer) */}
                  <Route path="/course-player/:courseId" element={
                    <ProtectedRoute>
                      <CourseViewer />
                    </ProtectedRoute>
                  } />
                  {/* UnitViewer without MainLayout (no Navbar/Footer) */}
                  <Route path="/unit-viewer/:unitId" element={
                    <ProtectedRoute>
                      <UnitViewer />
                    </ProtectedRoute>
                  } />
                </Routes>
              </div>
            </CourseProvider>
          </AuthProvider>
        </ThemeProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
