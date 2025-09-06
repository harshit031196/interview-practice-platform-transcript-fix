'use client'

interface LoadingAnimationProps {
  message?: string
  fullscreen?: boolean
}

export function LoadingAnimation({ message = 'Loading...', fullscreen = false }: LoadingAnimationProps) {
  return (
    <div className={`${fullscreen ? 'min-h-screen bg-white' : 'min-h-[240px]'} w-full flex flex-col items-center justify-center px-4`}>
      {/* Logo */}
      <img
        src="/images/wingman-logo.png"
        alt="Wingman Logo"
        className="w-16 h-16 mb-3"
      />

      {/* Wave bars */}
      <div className="flex items-end gap-1 h-5 mb-3" aria-hidden="true">
        <span className="block w-1.5 bg-indigo-600 rounded-sm animate-wave" style={{ animationDelay: '0s' }} />
        <span className="block w-1.5 bg-indigo-600 rounded-sm animate-wave" style={{ animationDelay: '0.12s' }} />
        <span className="block w-1.5 bg-indigo-600 rounded-sm animate-wave" style={{ animationDelay: '0.24s' }} />
        <span className="block w-1.5 bg-indigo-600 rounded-sm animate-wave" style={{ animationDelay: '0.36s' }} />
        <span className="block w-1.5 bg-indigo-600 rounded-sm animate-wave" style={{ animationDelay: '0.48s' }} />
      </div>

      <div className="text-center">
        <div className="text-sm font-medium text-gray-700">{message}</div>
      </div>

      <style jsx>{`
        @keyframes wave { 
          0%   { height: 6px; opacity: 0.5; }
          50%  { height: 20px; opacity: 1; }
          100% { height: 6px; opacity: 0.5; }
        }
        .animate-wave { 
          animation: wave 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
