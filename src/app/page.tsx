import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { BeaverMascot } from '@components/brand/beaver-mascot';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <BeaverMascot size={96} className="mb-2" />
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Bobr Quiz
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground sm:text-xl">
          Create engaging quizzes, host live game sessions, and challenge your
          friends with real-time multiplayer trivia.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg" className="min-w-[140px]">
            <Link href="/join">Join Game</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="min-w-[140px]"
          >
            <Link href="/host">Host Game</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-w-[140px]">
            <Link href="/admin">Admin</Link>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t bg-muted/50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">
            How It Works
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    1
                  </span>
                  Create
                </CardTitle>
                <CardDescription>
                  Build quizzes with multiple-choice questions, images, and
                  custom time limits.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    2
                  </span>
                  Host
                </CardTitle>
                <CardDescription>
                  Start a live session and share the join code with your
                  players.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    3
                  </span>
                  Play
                </CardTitle>
                <CardDescription>
                  Compete in real-time with speed-based scoring and live
                  leaderboards.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
        <p>Bobr Quiz &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
