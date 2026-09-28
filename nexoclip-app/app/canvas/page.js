export default function CanvasPage() {
  return (
    <main className="min-h-screen bg-black">
      <iframe
        title="Canvas"
        src="/spite?embedded=canvas"
        className="h-screen w-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </main>
  );
}
