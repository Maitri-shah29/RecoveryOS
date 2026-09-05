import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-12 sm:px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Recovery case not found</CardTitle>
          <CardDescription>The requested record does not exist or is no longer available in this demo dataset.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/">Return to overview</Link>
        </CardContent>
      </Card>
    </main>
  );
}
