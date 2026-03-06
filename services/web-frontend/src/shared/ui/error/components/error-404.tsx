import { Button } from '@/shared/ui/button';
import { useNavigate } from '@tanstack/react-router';

export function Error404() {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate({ to: '/' });
  };

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="flex items-center justify-center h-full bg-white pt-[15%] px-6">
      <div className="text-center space-y-8 max-w-md w-full">
        <div className="text-[120px] font-[800] text-[var(--primary-500)] leading-none select-none">
          404
        </div>
        <h1 className="text-4xl font-extrabold text-gray-700">
          Oops! Page not found
        </h1>

        <p className="text-gray-500 text-base leading-relaxed">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button
            onClick={handleGoBack}
            variant="outline"
            className="w-full sm:w-auto text-gray-700 hover:bg-gray-50"
          >
            Go back
          </Button>

          <Button
            onClick={handleGoHome}
            className="w-full sm:w-auto bg-[var(--primary-500)] text-white"
          >
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
