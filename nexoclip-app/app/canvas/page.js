export default function CanvasPage() {
  return (
    <div className="min-h-screen bg-[#FFF6DE] flex flex-col items-center justify-center p-6 text-[#110C2A]">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-md p-8 rounded-3xl border border-[#110C2A]/10 text-center shadow-lg space-y-4">
        <div className="w-16 h-16 bg-[#A175FF]/20 text-[#6c3df4] rounded-2xl flex items-center justify-center text-3xl mx-auto">
          🎨
        </div>
        <h1 className="text-xl font-extrabold text-[#110C2A]">Canvas Studio</h1>
        <p className="text-xs text-[#110C2A]/65 leading-relaxed">
          Fitur Canvas memerlukan service eksternal <code>spite</code> yang berjalan di container Docker.
          Untuk menggunakan fitur pembuatan gambar dan AI produk, silakan buka <strong>Product Studio</strong>.
        </p>
        <div className="pt-2">
          <a
            href="/studio/product-studio"
            className="inline-block w-full py-3 px-4 bg-[#110C2A] hover:bg-black text-white text-xs font-bold rounded-xl shadow-md transition-colors"
          >
            Buka Product Studio ➔
          </a>
        </div>
      </div>
    </div>
  );
}
