'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ImageItem, PackedItem, MaxRectsPacker, PackerOptions, nextPowerOfTwo, generateExportData, ExportFormat, PackingAlgorithm } from '@/lib/packer';
import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function TexturePacker({ locale }: Props) {
  const t = getTranslations(locale);
  
  const [images, setImages] = useState<ImageItem[]>([]);
  const [packedResult, setPackedResult] = useState<{ packed: PackedItem[]; width: number; height: number } | null>(null);
  const [settings, setSettings] = useState<PackerOptions>({
    maxWidth: 2048,
    maxHeight: 2048,
    padding: 2,
    allowRotation: false,
    powerOfTwo: true,
    algorithm: 'maxrects-bssf',
    trimAlpha: false,
    extrude: 0,
  });
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [imageName, setImageName] = useState('spritesheet.png');
  const [zoom, setZoom] = useState(1);
  const [showBorders, setShowBorders] = useState(true);
  const [bgColor, setBgColor] = useState('transparent');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadImage = useCallback((file: File): Promise<ImageItem> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            width: img.width,
            height: img.height,
            image: img,
            url: e.target?.result as string,
          });
        };
        img.onerror = () => reject(new Error(t.errors.loadFailed));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error(t.errors.loadFailed));
      reader.readAsDataURL(file);
    });
  }, [t.errors.loadFailed]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    const newImages: ImageItem[] = [];

    for (const file of imageFiles) {
      try {
        const img = await loadImage(file);
        newImages.push(img);
      } catch (error) {
        console.error(error);
      }
    }

    setImages((prev) => [...prev, ...newImages]);
  }, [loadImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setImages([]);
    setPackedResult(null);
  }, []);

  const pack = useCallback(() => {
    if (images.length === 0) {
      alert(t.errors.noImages);
      return;
    }

    const packer = new MaxRectsPacker(settings);
    const packed = packer.pack(images);

    const failed = packed.filter((p) => !p.placed);
    if (failed.length > 0) {
      alert(`${t.errors.packFailed} (${failed.length})`);
    }

    const bounds = packer.getUsedBounds();
    let finalWidth = bounds.width;
    let finalHeight = bounds.height;

    if (settings.powerOfTwo) {
      finalWidth = nextPowerOfTwo(finalWidth);
      finalHeight = nextPowerOfTwo(finalHeight);
    }

    setPackedResult({
      packed: packed.filter((p) => p.placed),
      width: finalWidth,
      height: finalHeight,
    });
  }, [images, settings, t.errors]);

  // Render canvas
  useEffect(() => {
    if (!packedResult || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { packed, width, height } = packedResult;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }

    packed.forEach((item) => {
      ctx.save();
      if (item.rotated) {
        ctx.translate(item.x + item.height, item.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(item.image, 0, 0, item.width, item.height);
      } else {
        ctx.drawImage(item.image, item.x, item.y, item.width, item.height);
      }
      ctx.restore();

      if (showBorders) {
        ctx.strokeStyle = '#ff000066';
        ctx.lineWidth = 1;
        const w = item.rotated ? item.height : item.width;
        const h = item.rotated ? item.width : item.height;
        ctx.strokeRect(item.x, item.y, w, h);
      }
    });
  }, [packedResult, showBorders, bgColor]);

  const downloadImage = useCallback(() => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = imageName;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }, [imageName]);

  const downloadData = useCallback(() => {
    if (!packedResult) return;
    const data = generateExportData(packedResult.packed, packedResult.width, packedResult.height, exportFormat, imageName);
    const ext = exportFormat === 'css' ? 'css' : exportFormat === 'xml' ? 'xml' : 'json';
    const blob = new Blob([data], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = imageName.replace(/\.[^/.]+$/, `.${ext}`);
    link.href = URL.createObjectURL(blob);
    link.click();
  }, [packedResult, exportFormat, imageName]);

  const copyData = useCallback(() => {
    if (!packedResult) return;
    const data = generateExportData(packedResult.packed, packedResult.width, packedResult.height, exportFormat, imageName);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [packedResult, exportFormat, imageName]);

  const efficiency = packedResult
    ? ((packedResult.packed.reduce((sum, item) => sum + item.width * item.height, 0) / (packedResult.width * packedResult.height)) * 100).toFixed(1)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Panel */}
      <div className="space-y-6">
        {/* Upload */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">{t.upload.title}</h2>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <div className="text-4xl mb-2">📁</div>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
              {t.upload.button}
            </button>
            <p className="text-gray-500 text-sm mt-2">{t.upload.dragHint}</p>
            <p className="text-gray-400 text-xs mt-1">{t.upload.formats}</p>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">{t.settings.title}</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t.settings.maxWidth}</label>
                <select
                  value={settings.maxWidth}
                  onChange={(e) => setSettings({ ...settings, maxWidth: Number(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {[512, 1024, 2048, 4096, 8192].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t.settings.maxHeight}</label>
                <select
                  value={settings.maxHeight}
                  onChange={(e) => setSettings({ ...settings, maxHeight: Number(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {[512, 1024, 2048, 4096, 8192].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t.settings.padding}</label>
                <input
                  type="number"
                  value={settings.padding}
                  onChange={(e) => setSettings({ ...settings, padding: Number(e.target.value) })}
                  min={0}
                  max={16}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t.settings.extrude}</label>
                <input
                  type="number"
                  value={settings.extrude}
                  onChange={(e) => setSettings({ ...settings, extrude: Number(e.target.value) })}
                  min={0}
                  max={8}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.settings.algorithm}</label>
              <select
                value={settings.algorithm}
                onChange={(e) => setSettings({ ...settings, algorithm: e.target.value as PackingAlgorithm })}
                className="w-full border rounded-lg px-3 py-2"
              >
                {(['maxrects-bssf', 'maxrects-blsf', 'maxrects-baf', 'shelf'] as const).map((alg) => (
                  <option key={alg} value={alg}>{t.algorithms[alg]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.settings.backgroundColor}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBgColor('transparent')}
                  className={`flex-1 py-2 rounded-lg border ${bgColor === 'transparent' ? 'border-indigo-500 bg-indigo-50' : ''}`}
                >
                  {t.settings.transparent}
                </button>
                <input
                  type="color"
                  value={bgColor === 'transparent' ? '#ffffff' : bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-12 h-10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowRotation}
                  onChange={(e) => setSettings({ ...settings, allowRotation: e.target.checked })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="text-sm">{t.settings.allowRotation}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.powerOfTwo}
                  onChange={(e) => setSettings({ ...settings, powerOfTwo: e.target.checked })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="text-sm">{t.settings.powerOfTwo}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Image List */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{t.imageList.title} ({images.length})</h2>
            {images.length > 0 && (
              <button onClick={clearAll} className="text-sm text-red-500 hover:text-red-700">
                {t.imageList.removeAll}
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {images.length === 0 ? (
              <p className="text-gray-400 text-center py-4">{t.imageList.empty}</p>
            ) : (
              images.map((img) => (
                <div key={img.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <img src={img.url} alt={img.name} className="w-10 h-10 object-contain border rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{img.name}</p>
                    <p className="text-xs text-gray-500">{img.width} × {img.height}</p>
                  </div>
                  <button onClick={() => removeImage(img.id)} className="text-red-500 hover:text-red-700 px-2">×</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={pack}
            disabled={images.length === 0}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {t.actions.generate}
          </button>
        </div>
      </div>

      {/* Right Panel - Preview & Export */}
      <div className="lg:col-span-2 space-y-6">
        {/* Preview */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{t.preview.title}</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showBorders}
                  onChange={(e) => setShowBorders(e.target.checked)}
                  className="w-4 h-4"
                />
                {t.preview.showBorders}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{t.preview.zoom}:</span>
                <input
                  type="range"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm w-12">{Math.round(zoom * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-100 rounded-lg p-4 min-h-[400px] overflow-auto flex items-center justify-center"
               style={{ backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' }}>
            {packedResult ? (
              <canvas
                ref={canvasRef}
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center', maxWidth: '100%' }}
                className="shadow-lg"
              />
            ) : (
              <p className="text-gray-400">{t.preview.empty}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        {packedResult && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">{t.stats.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-indigo-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-indigo-600">{packedResult.width} × {packedResult.height}</p>
                <p className="text-sm text-gray-600">{t.stats.size}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{packedResult.packed.length}</p>
                <p className="text-sm text-gray-600">{t.stats.images}</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">{efficiency}%</p>
                <p className="text-sm text-gray-600">{t.stats.efficiency}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{images.length - packedResult.packed.length}</p>
                <p className="text-sm text-gray-600">{t.stats.failed}</p>
              </div>
            </div>
          </div>
        )}

        {/* Export */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">{t.export.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.export.format}</label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                className="w-full border rounded-lg px-3 py-2"
              >
                {(['json', 'json-array', 'css', 'xml', 'cocos2d', 'phaser3', 'unity'] as const).map((fmt) => (
                  <option key={fmt} value={fmt}>{t.formats[fmt]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.export.imageName}</label>
              <input
                type="text"
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={downloadImage}
              disabled={!packedResult}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {t.export.downloadImage}
            </button>
            <button
              onClick={downloadData}
              disabled={!packedResult}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {t.export.downloadData}
            </button>
            <button
              onClick={copyData}
              disabled={!packedResult}
              className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {copied ? t.export.copied : t.export.copyData}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
