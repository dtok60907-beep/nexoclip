const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const dir = '/mnt/c/Users/PC/AppData/Local/Temp';
  const shots = [
    ['nexoclip-localhost-new.png', 'Punya ide konten?', 'Mulai dari satu tempat.'],
    ['nexoclip-localhost-new.png', 'Kenalan dengan NexoClip.', 'Tulis ide. Pilih ruang kreasimu.'],
    ['nexoclip-image.png', 'Bangun visualnya.', 'Eksplorasi gambar lewat Image Studio.'],
    ['nexoclip-video-studio.png', 'Lanjutkan ke video.', 'Atur model, format, dan durasi di Video Studio.'],
    ['nexoclip-cinema.png', 'Bentuk tampilan sinematik.', 'Mulai dengan kamera dan gaya pilihanmu.'],
    ['nexoclip-localhost-new.png', 'Ide berikutnya mulai di sini.', 'Cobain nexoclip.com'],
  ];
  const images = await Promise.all(shots.map(s => loadImage(path.join(dir, s[0]))));
  fs.mkdirSync('public/demos', { recursive: true });
  const canvas = createCanvas(1080, 1350), ctx = canvas.getContext('2d');
  const encoder = spawn('/tmp/nexoclip-video-tools/node_modules/ffmpeg-static/ffmpeg', ['-y','-f','image2pipe','-vcodec','png','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','public/demos/nexoclip-linkedin-real-ui.mp4'], {stdio:['pipe','ignore','inherit']});
  const finished = once(encoder, 'close');
  encoder.stdin.on('error', () => {});
  function text(s,x,y,size,color='#f4f5ef') {ctx.fillStyle=color;ctx.font=`${size>40?600:400} ${size}px sans-serif`;ctx.fillText(s,x,y);}
  for (let frame=0;frame<900;frame++) {
    const i=Math.floor(frame/150), p=(frame%150)/150;
    ctx.fillStyle='#10140e';ctx.fillRect(0,0,1080,1350);
    text('nexoclip',64,95,42,'#d4ff64');text('PRODUCT WALKTHROUGH',650,91,20,'#9ca895');
    ctx.save();ctx.globalAlpha=Math.min(1,p*10);text(shots[i][1],64,245,50);text(shots[i][2],64,310,27,'#b6c1af');ctx.restore();
    ctx.save();ctx.beginPath();ctx.roundRect(40,400,1000,695,20);ctx.clip();
    const zoom=1+p*.045,w=1000*zoom,h=w*1000/1440;
    ctx.drawImage(images[i],40-(w-1000)/2,400-(h-695)/2,w,h);ctx.restore();
    text('UI asli NexoClip · Preview sebelum login',64,1165,22,'#9ca895');
    text(i===5?'nexoclip.com ↗':'Dari ide ke ruang kreatifmu.',64,1235,34,i===5?'#d4ff64':'#f4f5ef');
    ctx.fillStyle='#30382b';ctx.fillRect(64,1290,952,3);ctx.fillStyle='#d4ff64';ctx.fillRect(64,1290,952*frame/899,3);
    const png=canvas.toBuffer('image/png');
    if(!encoder.stdin.write(png)) await once(encoder.stdin,'drain');
    if(frame%150===0) console.log(`Scene ${i+1}/6`);
  }
  encoder.stdin.end();const [code]=await finished;if(code!==0)throw Error('Video encoding failed');
  console.log('Rendered 900 frames / 30 seconds: public/demos/nexoclip-linkedin-real-ui.mp4');
}
main().catch(e=>{console.error(e);process.exitCode=1});
