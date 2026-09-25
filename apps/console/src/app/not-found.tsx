export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center gap-3 bg-background text-foreground">
      <h1 className="border-r border-border pr-3 text-xl font-medium">404</h1>
      <h2 className="text-sm">This page could not be found.</h2>
    </div>
  );
}
