export type FilmPreset = "fb35" | "dispo98" | "ccd04";

export type FilmRenderOptions = {
  dateStamp?: boolean;
  colorFlash?: boolean;
};

const presetValues: Record<FilmPreset, [number, number, number, number]> = {
  fb35: [1.08, 0.88, 0.14, 0],
  dispo98: [1.15, 1.04, 0.2, 1],
  ccd04: [1.12, 0.92, 0.09, 2],
};

const vertexShader = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const fragmentShader = `
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_seed;
uniform vec4 u_style;
varying vec2 v_texCoord;

float random(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + u_seed) * 43758.5453);
}

void main() {
  vec2 uv = v_texCoord;
  vec3 color = texture2D(u_image, uv).rgb;
  float contrast = u_style.x;
  float saturation = u_style.y;
  float grainAmount = u_style.z;
  float preset = u_style.w;

  color = (color - 0.5) * contrast + 0.5;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, saturation);

  if (preset < 0.5) {
    color *= vec3(1.08, 1.015, 0.9);
    color += vec3(0.025, 0.008, -0.018);
  } else if (preset < 1.5) {
    color *= vec3(1.12, 0.96, 0.82);
    color += vec3(0.04, 0.005, -0.025);
  } else {
    color *= vec3(0.91, 1.02, 1.1);
    color += vec3(-0.012, 0.006, 0.025);
  }

  float grain = random(uv * u_resolution + u_seed) - 0.5;
  color += grain * grainAmount;

  float distanceToCenter = distance(uv, vec2(0.5));
  float vignette = smoothstep(0.82, 0.22, distanceToCenter);
  color *= mix(0.62, 1.0, vignette);

  float scratchX = random(vec2(floor(uv.x * 260.0), u_seed));
  float scratch = step(0.996, scratchX) * smoothstep(0.2, 0.5, random(vec2(uv.y, u_seed)));
  color += scratch * 0.16;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Не удалось создать шейдер.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Ошибка компиляции шейдера.");
  }
  return shader;
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось подготовить кадр."))),
      "image/jpeg",
      0.9,
    );
  });
}

async function finishFrame(canvas: HTMLCanvasElement, options: FilmRenderOptions) {
  if (!options.dateStamp && !options.colorFlash) return canvasToBlob(canvas);

  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (!context) return canvasToBlob(canvas);
  context.drawImage(canvas, 0, 0);

  if (options.colorFlash) {
    context.save();
    context.globalCompositeOperation = "screen";
    const glow = context.createRadialGradient(
      output.width * 0.48,
      output.height * 0.46,
      output.width * 0.04,
      output.width * 0.48,
      output.height * 0.46,
      output.width * 0.72,
    );
    glow.addColorStop(0, "rgba(255, 236, 205, .34)");
    glow.addColorStop(0.45, "rgba(255, 142, 94, .12)");
    glow.addColorStop(1, "rgba(255, 95, 50, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, output.width, output.height);
    context.restore();
  }

  if (options.dateStamp) {
    const date = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date()).replaceAll("/", " ");
    const fontSize = Math.max(20, Math.round(output.width * 0.027));
    context.save();
    context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.shadowColor = "rgba(92, 30, 0, .7)";
    context.shadowBlur = Math.max(2, Math.round(fontSize * 0.12));
    context.fillStyle = "#ff9b55";
    context.fillText(date, output.width * 0.94, output.height * 0.94);
    context.restore();
  }

  return canvasToBlob(output);
}

async function canvasFallback(
  image: HTMLImageElement,
  width: number,
  height: number,
  options: FilmRenderOptions,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Обработка изображений недоступна.");
  context.filter = "contrast(1.08) saturate(.88) sepia(.12)";
  context.drawImage(image, 0, 0, width, height);
  return finishFrame(canvas, options);
}

export async function applyFilmEffect(
  file: File,
  preset: FilmPreset,
  options: FilmRenderOptions = {},
) {
  const image = await loadImage(file);
  const maxSide = 2400;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) return canvasFallback(image, width, height, options);

  const program = gl.createProgram();
  if (!program) throw new Error("WebGL недоступен.");
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Ошибка запуска шейдера.");
  }
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);
  const texCoord = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texCoord);
  gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
  gl.uniform1f(gl.getUniformLocation(program, "u_seed"), Math.random() * 1000);
  gl.uniform4fv(gl.getUniformLocation(program, "u_style"), presetValues[preset]);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  return finishFrame(canvas, options);
}
