"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-12 sm:px-6">
      <Card className="w-full border-amber-400/30">
        <CardHeader>
          <CardTitle>This view could not be loaded</CardTitle>
          <CardDescription>No recovery action was executed. Retry the read, or return to the overview using the navigation above.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset}>Retry safely</Button>
        </CardContent>
      </Card>
    </main>
  );
}
