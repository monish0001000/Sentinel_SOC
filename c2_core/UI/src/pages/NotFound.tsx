import { Link, useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black text-foreground">404</h1>
        <p className="text-base text-muted-foreground">
          No route matches <code className="font-mono text-foreground">{location.pathname}</code>
        </p>
        <Link
          to="/"
          className="inline-block text-sm font-medium text-primary underline hover:text-primary/80"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
