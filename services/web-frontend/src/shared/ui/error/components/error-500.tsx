import { Link } from '@tanstack/react-router';
import { WarningIcon } from '@/shared/ui/icons';

export function Error500() {
  const handleRetry = () => {
    // TODO: use tanstack router to go back
    window.location.reload();
  };

  return (
    <div className="flex items-center justify-center h-full bg-white pt-[15%] px-6">
      <div className="text-center space-y-8 w-full">
        {/* Warning Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center">
            <WarningIcon className="w-20 h-20 text-primary-400" />
          </div>
        </div>

        {/* Error Title */}
        <h1 className="text-4xl font-extrabold text-gray-700">
          Oops! Something went wrong
        </h1>

        {/* Error Message */}
        <p className="text-gray-500 text-base leading-relaxed">
          Try by{' '}
          <Link
            to="/"
            className="text-[var(--primary-400)]"
            onClick={handleRetry}
          >
            reloading the page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
