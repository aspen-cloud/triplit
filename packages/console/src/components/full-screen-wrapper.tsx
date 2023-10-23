export function FullScreenWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-screen bg-popover flex justify-center items-center flex-col">
      {children}
    </div>
  );
}
