import canvas from './data/canvas.json';
import image from './data/image.json';
import influencer from './data/influencer.json';
import video from './data/video.json';
import {Box, center, Config, Point} from './Walkthrough';

type Manifest = {steps: {name: string; boxes: Record<string, unknown>}[]};

// Element box recorded by the staging script for a step.
const box = (m: Manifest, step: string, key: string): Box => {
  const b = m.steps.find((s) => s.name === step)?.boxes[key] as Box | null | undefined;
  if (!b) throw new Error(`missing box ${step}.${key}`);
  return b;
};
const at = (m: Manifest, step: string, key: string): Point => center(box(m, step, key));

type Graph = {nodes: {id: string; type: string}[]; handles: {node: string; id: string; x: number; y: number}[]};
type NodeButton = {node: string; text: string; x: number; y: number; w: number; h: number};

// Canvas: handle and in-node button positions, looked up by node type.
const canvasStep = (name: string) => (canvas as Manifest).steps.find((s) => s.name === name)!.boxes as {graph: Graph; buttons: NodeButton[]; video: Box | null};
const handle = (step: string, type: string, id: string): Point => {
  const {graph} = canvasStep(step);
  const node = graph.nodes.find((n) => n.type === type)!;
  const h = graph.handles.find((x) => x.node === node.id && x.id === id)!;
  return {x: h.x, y: h.y};
};
const nodeButton = (step: string, text: RegExp): Point => {
  const b = canvasStep(step).buttons.find((x) => text.test(x.text))!;
  return center(b);
};

export const imageStudio: Config = {
  kicker: 'Image Studio',
  title: ['Foto produk dari', 'satu kalimat.'],
  subtitle: 'Begini cara pakai Image Studio di NexoClip.',
  url: 'app.nexoclip.com/studio/image',
  steps: [
    {shot: 'image/home', dur: 45, caption: 'Buka Image Studio, tulis ide gambarmu', to: at(image, 'home', 'prompt'), click: true},
    {shot: 'image/typed', dur: 80, type: box(image, 'typed', 'prompt')},
    {shot: 'image/typed', dur: 32, to: at(image, 'typed', 'model'), click: true},
    {shot: 'image/models', dur: 75, caption: 'Pilih model AI yang cocok', zoom: {x: 690, y: 400, scale: 1.25}, to: {x: 780, y: 374}, click: true},
    {shot: 'image/typed', dur: 50, caption: 'Atur rasio, lalu Generate', to: at(image, 'typed', 'generate'), click: true},
    {shot: 'image/generating', dur: 40},
    {shot: 'image/result1', dur: 70, caption: 'Hasilnya langsung masuk galeri', zoom: {...at(image, 'result1', 'card0'), scale: 1.35}},
    {shot: 'image/result3', dur: 95, caption: 'Lanjut bikin variasi: katalog, foto UGC, dan lainnya'},
  ],
  end: ['Foto produk siap jual,', 'tanpa sesi foto.'],
};

export const videoStudio: Config = {
  kicker: 'Video Studio',
  title: ['Foto produk jadi', 'video bersuara.'],
  subtitle: 'Begini cara pakai Video Studio di NexoClip.',
  url: 'app.nexoclip.com/studio/video',
  steps: [
    {shot: 'video/home', dur: 45, caption: 'Buka Video Studio, upload foto produk', to: at(video, 'home', 'upload'), click: true},
    {shot: 'video/uploaded', dur: 45, to: at(video, 'uploaded', 'model'), click: true},
    {shot: 'video/models', dur: 70, caption: 'Pilih model, di sini Seedance 2.0', zoom: {x: 720, y: 300, scale: 1.2}, to: at(video, 'models', 'option'), click: true},
    {shot: 'video/typed', dur: 85, caption: 'Jelaskan gerakan dan suaranya', type: box(video, 'typed', 'prompt'), cover: '#0e0e11'},
    {shot: 'video/typed', dur: 28, to: at(video, 'typed', 'ratio'), click: true},
    {shot: 'video/ratios', dur: 50, caption: 'Pilih rasio 9:16 untuk TikTok & Reels', to: at(video, 'ratios', 'opt916'), click: true},
    {shot: 'video/ratio916', dur: 45, caption: 'Cek kredit, lalu Generate', to: at(video, 'ratio916', 'generate'), click: true},
    {shot: 'video/generating', dur: 40},
    {
      shot: 'video/result', dur: 165, caption: 'Video 5 detik 720p, lengkap dengan suara',
      zoom: {...at(video, 'result', 'card0'), scale: 1.55},
      video: {src: 'examples/a3.mp4', box: box(video, 'result', 'card0')},
    },
  ],
  end: ['Dari foto diam', 'jadi video iklan.'],
};

export const influencerStudio: Config = {
  kicker: 'AI Influencer',
  title: ['Bikin karakter virtual', 'untuk kontenmu.'],
  subtitle: 'Begini cara pakai AI Influencer Studio di NexoClip.',
  url: 'app.nexoclip.com/studio/ai-influencer',
  steps: [
    {shot: 'influencer/builder', dur: 50, caption: 'Rancang karakter dari nol di Builder', to: at(influencer, 'builder', 'human'), click: true},
    {shot: 'influencer/ethnicity', dur: 45, caption: 'Pilih tipe, gender, dan etnis', to: at(influencer, 'ethnicity', 'asian'), click: true},
    {shot: 'influencer/asian', dur: 45, to: at(influencer, 'asian', 'brown'), click: true},
    {shot: 'influencer/asian', dur: 28, to: at(influencer, 'asian', 'body'), click: true},
    {shot: 'influencer/body', dur: 45, caption: 'Atur tubuh dan gaya', to: at(influencer, 'body', 'style'), click: true},
    {shot: 'influencer/style', dur: 45, to: at(influencer, 'style', 'r916'), click: true},
    {shot: 'influencer/details', dur: 75, caption: 'Tambah detail, pilih rasio 9:16', type: box(influencer, 'details', 'details')},
    {shot: 'influencer/details', dur: 35, caption: 'Generate Character', to: at(influencer, 'details', 'generate'), click: true},
    {shot: 'influencer/generating', dur: 40},
    {shot: 'influencer/result', dur: 110, caption: 'Karakter fiktif siap dipakai di kontenmu', zoom: {x: 1018, y: 424, scale: 1.25}},
  ],
  end: ['Satu karakter,', 'konten tanpa batas.'],
};

const videoBox = canvasStep('videoDone').video!;

export const canvasStudio: Config = {
  kicker: 'Canvas',
  title: ['Susun alur video', 'seperti papan ide.'],
  subtitle: 'Begini cara pakai Canvas di NexoClip.',
  url: 'app.nexoclip.com/canvas',
  steps: [
    {shot: 'canvas/list', dur: 50, caption: 'Buka Canvas, mulai New Project', to: {x: 392, y: 660}, click: true},
    {shot: 'canvas/empty', dur: 45, caption: 'Tambah node dari toolbar', to: at(canvas, 'empty', 'addPrompt'), click: true},
    {shot: 'canvas/prompt1', dur: 60, caption: 'Tulis prompt di node Prompt', to: at(canvas, 'prompt1', 'addImage'), click: true},
    {shot: 'canvas/imageModels', dur: 70, caption: 'Pilih model tiap generator, di sini Nano Banana', zoom: {x: 1062, y: 480, scale: 1.2}, to: {x: 974, y: 330}, click: true},
    {shot: 'canvas/image', dur: 40, caption: 'Tarik garis untuk menyambungkan node', to: handle('image', 'prompt', 'prompt-out')},
    {shot: 'canvas/wired1', dur: 40, to: handle('wired1', 'imageGen', 'prompt-in')},
    {shot: 'canvas/wired1', dur: 40, to: nodeButton('wired1', /^Generate/), click: true},
    {shot: 'canvas/imageDone', dur: 55, caption: 'Generate langsung di dalam node'},
    {shot: 'canvas/videoModels', dur: 85, caption: 'Mode Frame pakai gambar tersambung, mode Omni bisa @mention', zoom: {x: 1062, y: 480, scale: 1.2}, to: {x: 1004, y: 384}, click: true},
    {shot: 'canvas/wired2', dur: 55, caption: 'Sambungkan gambar dan prompt gerakan, lalu Generate', to: nodeButton('wired2', /^Generate/), click: true},
    {
      shot: 'canvas/videoDone', dur: 165, caption: 'Video 5 detik dengan suara, langsung di kanvas',
      zoom: {...center(videoBox), scale: 1.12},
      video: {src: 'examples/a3.mp4', box: videoBox},
    },
  ],
  end: ['Semua alurmu,', 'dalam satu kanvas.'],
};
