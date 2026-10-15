'use client';

import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/infrastructure/auth/supabase-auth-client';
import { Button } from '@/components/ui/button';
import { BeaverMascot } from '@components/brand/beaver-mascot';
import { useEffect, useState } from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <BeaverMascot size={28} />
              <h1 className="text-xl font-bold">Bobr Quiz Admin</h1>
            </div>
            <nav className="flex gap-4">
              <Button variant="ghost" asChild>
                <a href="/admin">Dashboard</a>
              </Button>
              <Button variant="ghost" asChild>
                <a href="/admin/quizzes">Quizzes</a>
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {userEmail && (
              <span className="hidden md:inline text-sm text-muted-foreground">
                {userEmail}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto p-4">{children}</main>
    </div>
  );
}
