import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './firebase';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { LanguageProvider } from './i18n';
import { GuestOnly, RequireAdmin, RequireReady, RequireUser } from './components/Guards';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Quiz from './pages/Quiz';
import Matches from './pages/Matches';
import Chats from './pages/Chats';
import ChatThread from './pages/ChatThread';
import Profile from './pages/Profile';
import Ideas from './pages/Ideas';
import IdeaNew from './pages/IdeaNew';
import IdeaDetail from './pages/IdeaDetail';
import Teams from './pages/Teams';
import IdeaDost from './pages/IdeaDost';
import Launchpad from './pages/Launchpad';
import ProductNew from './pages/ProductNew';
import ProductDetail from './pages/ProductDetail';
import TeamDetail from './pages/TeamDetail';
import Admin from './pages/Admin';
import WaitingForParent from './pages/WaitingForParent';
import Setup from './pages/Setup';
import NotFound from './pages/NotFound';
import Notifications from './pages/Notifications';
import Events from './pages/Events';
import EventDetail from './pages/EventDetail';
import Roles from './pages/Roles';
import Circles from './pages/Circles';
import CircleDetail from './pages/CircleDetail';
import Showcase from './pages/Showcase';
import ShowcasePage from './pages/ShowcasePage';
import Certificate from './pages/Certificate';
import Mentors from './pages/Mentors';
import MentorSession from './pages/MentorSession';
import Resume from './pages/Resume';

export default function App() {
  if (!isConfigured) return <Setup />;
  return (
    <LanguageProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route element={<GuestOnly />}>
                <Route path="/" element={<Landing />} />
              </Route>
              <Route path="/login" element={<Login />} />
              {/* Public project pages and certificates (adult teams only; Safe Mode ones stay private) */}
              <Route path="/p/:teamId" element={<ShowcasePage />} />
              <Route path="/certificate/:teamId/:uid" element={<Certificate />} />
  
              <Route element={<RequireUser />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/quiz" element={<Quiz />} />
                <Route path="/waiting-for-parent" element={<WaitingForParent />} />
              </Route>
  
              <Route element={<RequireReady />}>
                <Route element={<AppShell />}>
                  <Route path="/matches" element={<Matches />} />
                  <Route path="/chats" element={<Chats />} />
                  <Route path="/chats/:chatId" element={<ChatThread />} />
                  <Route path="/ideas" element={<Ideas />} />
                  <Route path="/ideas/new" element={<IdeaNew />} />
                  <Route path="/ideas/dost" element={<IdeaDost />} />
                  <Route path="/launchpad" element={<Launchpad />} />
                  <Route path="/launchpad/new" element={<ProductNew />} />
                  <Route path="/launchpad/:productId" element={<ProductDetail />} />
                  <Route path="/ideas/:ideaId" element={<IdeaDetail />} />
                  <Route path="/teams" element={<Teams />} />
                  <Route path="/teams/:teamId" element={<TeamDetail />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:eventId" element={<EventDetail />} />
                  <Route path="/roles" element={<Roles />} />
                  <Route path="/circles" element={<Circles />} />
                  <Route path="/circles/:circleId" element={<CircleDetail />} />
                  <Route path="/showcase" element={<Showcase />} />
                  <Route path="/mentors" element={<Mentors />} />
                  <Route path="/mentors/:sessionId" element={<MentorSession />} />
                  <Route path="/resume" element={<Resume />} />
                  <Route element={<RequireAdmin />}>
                    <Route path="/admin" element={<Admin />} />
                  </Route>
                </Route>
              </Route>
  
              <Route path="/home" element={<Navigate to="/matches" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  );
}
