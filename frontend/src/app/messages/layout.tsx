export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))] min-h-0 flex-col md:h-[calc(100dvh-1rem)] md:max-h-[100dvh]">
      {children}
    </div>
  );
}
