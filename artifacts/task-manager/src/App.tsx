import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { Toaster } from 'sonner';
import Home from './pages/home';
import Todo from './pages/todo';
import Diary from './pages/diary';
import Routine from './pages/routine';
import Goals from './pages/goals';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    }
  }
});

function Nav() {
  const [location, setLocation] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  const go = (path: string) => setLocation(path);
  const active =
    location === '/' || location === ''
      ? 'done'
      : location === '/diary'
        ? 'diary'
        : location === '/routine'
          ? 'routine'
          : location === '/goals'
            ? 'goals'
            : 'todo';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 px-4 pointer-events-none">
      <div className="flex gap-1 bg-background/80 backdrop-blur-sm border border-border/60 rounded-full px-1.5 py-1.5 shadow-sm pointer-events-auto">
        <button
          onClick={() => go('/')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
            active === 'done'
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Done List
        </button>
        <button
          onClick={() => go('/todo')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
            active === 'todo'
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Todo List
        </button>
        <button
          onClick={() => go('/diary')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
            active === 'diary'
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Diary
        </button>
        <button
          onClick={() => go('/routine')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
            active === 'routine'
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Routine
        </button>
        <button
          onClick={() => go('/goals')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
            active === 'goals'
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Goals
        </button>
      </div>
    </nav>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Nav />
        <div className="pt-16">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/todo" component={Todo} />
            <Route path="/diary" component={Diary} />
            <Route path="/routine" component={Routine} />
            <Route path="/goals" component={Goals} />
            <Route>
              <div className="min-h-[100dvh] flex items-center justify-center font-sans text-muted-foreground bg-background">
                404 - Page Not Found
              </div>
            </Route>
          </Switch>
        </div>
      </WouterRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'font-sans rounded-xl border-border bg-card text-foreground shadow-lg',
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
