import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { lazy, Suspense, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { session, bootSession } from "@/lib/store";
import { Shell } from "@/components/Shell";
import AuthGate from "@/pages/AuthGate";
import Home from "@/pages/Home";
import AuctionCentre from "@/pages/AuctionCentre";
import Modes from "@/pages/Modes";
import Players from "@/pages/Players";
import PlayerProfile from "@/pages/PlayerProfile";
import AICentre from "@/pages/AICentre";
import StatsHub from "@/pages/StatsHub";
import Franchises from "@/pages/Franchises";
import MatchSim from "@/pages/MatchSim";
import Tournament from "@/pages/Tournament";
import Rankings from "@/pages/Rankings";
import Records from "@/pages/Records";
import HallOfFamePage from "@/pages/HallOfFame";
import Scouting from "@/pages/Scouting";
import Friends from "@/pages/Friends";
import Trophies from "@/pages/Trophies";
import Profile from "@/pages/Profile";
import Career from "@/pages/Career";
import Cards from "@/pages/Cards";
import JoinRoom from "@/pages/JoinRoom";

const Room = lazy(() => import("@/pages/room/Room"));

function Loading() {
  return <div className="min-h-[50vh] grid place-items-center text-muted-foreground text-sm">Loading…</div>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/room/:code">{(p) => <Suspense fallback={<Loading />}><Room code={p.code.toUpperCase()} /></Suspense>}</Route>
      <Route path="/join/:code">{(p) => <JoinRoom code={p.code.toUpperCase()} />}</Route>
      <Route>
        <Shell>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/auction" component={AuctionCentre} />
            <Route path="/modes" component={Modes} />
            <Route path="/players" component={Players} />
            <Route path="/players/:id">{(p) => <PlayerProfile id={p.id} />}</Route>
            <Route path="/ai" component={AICentre} />
            <Route path="/stats" component={StatsHub} />
            <Route path="/franchises" component={Franchises} />
            <Route path="/match" component={MatchSim} />
            <Route path="/tournament" component={Tournament} />
            <Route path="/rankings" component={Rankings} />
            <Route path="/records" component={Records} />
            <Route path="/hall-of-fame" component={HallOfFamePage} />
            <Route path="/scouting" component={Scouting} />
            <Route path="/friends" component={Friends} />
            <Route path="/trophies" component={Trophies} />
            <Route path="/profile" component={Profile} />
            <Route path="/career" component={Career} />
            <Route path="/cards" component={Cards} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
      </Route>
    </Switch>
  );
}

function Gate() {
  const ready = session.use((s) => s.ready);
  const me = session.use((s) => s.me);
  useEffect(() => { bootSession(); }, []);
  if (!ready) return <div className="app-bg grid place-items-center text-muted-foreground">Connecting to the arena…</div>;
  if (!me) return <AuthGate />;
  return (
    <Router hook={useHashLocation}>
      <AppRouter />
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <Toaster />
        <Gate />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
