import React from 'react';
import DotLoader from '@/shared/ui/icons/dot-loader';

interface GenericLoaderProps {
  className?: string;
}

const GenericLoader: React.FC<GenericLoaderProps> = ({ className = '' }) => {
  return (
    <div
      className={`flex flex-col justify-center items-center h-screen gap-4 ${className}`}
    >
      <DotLoader className="animate-spin size-8" />
      <p className="text-sm text-zinc-700">Loading...</p>
    </div>
  );
};

export { GenericLoader };
