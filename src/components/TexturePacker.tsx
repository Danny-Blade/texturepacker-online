'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ImageItem, MaxRectsPacker, PackerOptions, nextPowerOfTwo, generateExportData, ExportFormat, PackingAlgorithm } from '@/lib/packer';
import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function TexturePacker({ locale }: Props) {
  const t = getTranslations(locale);
  
  const [images, setImages] = useState<ImageItem[]>([]);
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
  const [outputDir, setOutputDir] = useState('');
  const [selectedDirPath, setSelectedDirPath] = useState('');
  const [fileName, setFileName] = useState('spritesheet');
  const [zoom, setZoom] = useState(1);
  const [showBorders, setShowBorders] = useState(true);
  const [bgColor, setBgColor] = useState('transparent');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-pack when images or settings change
  const packedResult = useMemo(() => {
    if (images.length === 0) return null;

    const packer = new MaxRectsPacker(settings);
    const packed = packer.pack(images);
    const bounds = packer.getUsedBounds();
    
    let finalWidth = bounds.width;
    let finalHeight = bounds.height;

    if (settings.powerOfTwo) {
      finalWidth = nextPowerOfTwo(finalWidth);
      finalHeight = nextPowerOfTwo(finalHeight);
    }

    // Ensure minimum size
    finalWidth = Math.max(finalWidth, 1);
    finalHeight = Math.max(finalHeight, 1);

    return {
      packed: packed.filter((p) => p.placed),
      failed: packed.filter((p) => !p.placed),
      width: finalWidth,
      height: finalHeight,
    };
  }, [images, settings]);

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
  }, []);

  // Check if output size exceeds max dimensions
  const exceedsMaxSize = useMemo(() => {
    if (!packedResult) return false;
    return packedResult.width > settings.maxWidth || packedResult.height > settings.maxHeight;
  }, [packedResult, settings]);

  // Render canvas when packed result changes
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
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
        ctx.lineWidth = 1;
        const w = item.rotated ? item.height : item.width;
        const h = item.rotated ? item.width : item.height;
        ctx.strokeRect(item.x, item.y, w, h);
      }
    });

    // Draw red border if exceeds max size
    if (exceedsMaxSize) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(0, 0, settings.maxWidth, settings.maxHeight);
      ctx.setLineDash([]);
    }
  }, [packedResult, showBorders, bgColor, exceedsMaxSize, settings]);

  // Directory handle for saving files
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const selectDirectory = useCallback(async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      dirHandleRef.current = handle;
      setSelectedDirPath(handle.name);
    } catch (error) {
      // User cancelled or error
      console.log('Directory selection cancelled or failed:', error);
    }
  }, []);

  const downloadAll = useCallback(async () => {
    if (!packedResult || !canvasRef.current) return;

    const imageNameForExport = outputDir ? `${outputDir}/${fileName}.png` : fileName + '.png';
    const data = generateExportData(packedResult.packed, packedResult.width, packedResult.height, exportFormat, imageNameForExport);

    // Check if directory handle exists and File System Access API is supported
    if (dirHandleRef.current && 'showDirectoryPicker' in window) {
      try {
        // Save to selected directory
        let targetDir = dirHandleRef.current;

        // Create subdirectory if specified
        if (outputDir) {
          targetDir = await dirHandleRef.current.getDirectoryHandle(outputDir, { create: true });
        }

        // Save image file
        const canvas = canvasRef.current;
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });
        const imageFileHandle = await targetDir.getFileHandle(fileName + '.png', { create: true });
        const imageWritable = await imageFileHandle.createWritable();
        await imageWritable.write(blob);
        await imageWritable.close();

        // Save data file
        const ext = exportFormat === 'css' ? 'css' : exportFormat === 'xml' ? 'xml' : exportFormat === 'cocos2d' ? 'plist' : 'json';
        const dataBlob = new Blob([data], { type: 'text/plain' });
        const dataFileHandle = await targetDir.getFileHandle(fileName + '.' + ext, { create: true });
        const dataWritable = await dataFileHandle.createWritable();
        await dataWritable.write(dataBlob);
        await dataWritable.close();

        setNotification('Files saved successfully!');
        setTimeout(() => setNotification(null), 3000);
        return;
      } catch (error) {
        console.error('Failed to save with File System Access API:', error);
        // Fall back to traditional download
      }
    }

    // Traditional download method (fallback)
    const imageLink = document.createElement('a');
    imageLink.download = fileName + '.png';
    imageLink.href = canvasRef.current.toDataURL('image/png');
    imageLink.click();

    const ext = exportFormat === 'css' ? 'css' : exportFormat === 'xml' ? 'xml' : exportFormat === 'cocos2d' ? 'plist' : 'json';
    const blob = new Blob([data], { type: 'text/plain' });
    const dataLink = document.createElement('a');
    dataLink.download = fileName + '.' + ext;
    dataLink.href = URL.createObjectURL(blob);
    dataLink.click();
  }, [packedResult, exportFormat, fileName, outputDir]);

  const copyData = useCallback(() => {
    if (!packedResult) return;
    const imageNameForExport = outputDir ? `${outputDir}/${fileName}.png` : fileName + '.png';
    const data = generateExportData(packedResult.packed, packedResult.width, packedResult.height, exportFormat, imageNameForExport);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [packedResult, exportFormat, fileName, outputDir]);

  // Save project to .tps file
  const saveProject = useCallback(async () => {
    try {
      // Convert images to base64 for storage
      const imagesData = images.map(img => ({
        ...img,
        imageData: img.url, // Already base64 data URL
      }));

      const projectData = {
        version: '1.0',
        settings,
        exportFormat,
        outputDir,
        fileName,
        selectedDirPath, // Save the selected directory path
        images: imagesData,
      };

      const projectFileName = `${fileName}.tps`;

      // Check if directory handle exists and File System Access API is supported
      if (dirHandleRef.current && 'showDirectoryPicker' in window) {
        try {
          let targetDir = dirHandleRef.current;

          // Create subdirectory if specified
          if (outputDir) {
            targetDir = await dirHandleRef.current.getDirectoryHandle(outputDir, { create: true });
          }

          // Check if project file already exists
          try {
            // Try to get the existing file
            const existingFileHandle = await targetDir.getFileHandle(projectFileName);
            // File exists, overwrite it
            const writable = await existingFileHandle.createWritable();
            await writable.write(JSON.stringify(projectData, null, 2));
            await writable.close();
            setNotification(t.project.saved);
            setTimeout(() => setNotification(null), 3000);
            return;
          } catch (error) {
            // File doesn't exist, create new one
            const newFileHandle = await targetDir.getFileHandle(projectFileName, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(JSON.stringify(projectData, null, 2));
            await writable.close();
            setNotification(t.project.saved);
            setTimeout(() => setNotification(null), 3000);
            return;
          }
        } catch (error) {
          console.error('Failed to save with File System Access API:', error);
          // Fall back to traditional download
        }
      }

      // Traditional download method (fallback)
      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.download = projectFileName;
      link.href = URL.createObjectURL(blob);
      link.click();

      setNotification(t.project.saved);
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Save error:', error);
      setNotification(t.project.saveError);
      setTimeout(() => setNotification(null), 3000);
    }
  }, [images, settings, exportFormat, outputDir, fileName, selectedDirPath, t.project.saved, t.project.saveError]);

  const openProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const projectData = JSON.parse(content);

        // Validate project structure
        if (!projectData.version || !projectData.images) {
          throw new Error('Invalid project format');
        }

        // Load images from base64
        const loadedImages: ImageItem[] = [];
        for (const imgData of projectData.images) {
          try {
            const img = await new Promise<ImageItem>((resolve, reject) => {
              const image = new Image();
              image.onload = () => {
                resolve({
                  id: imgData.id,
                  name: imgData.name,
                  width: image.width,
                  height: image.height,
                  image: image,
                  url: imgData.imageData,
                });
              };
              image.onerror = () => reject(new Error('Failed to load image'));
              image.src = imgData.imageData;
            });
            loadedImages.push(img);
          } catch (error) {
            console.error(`Failed to load image: ${imgData.name}`, error);
          }
        }

        // Restore settings
        if (projectData.settings) {
          setSettings(projectData.settings);
        }
        if (projectData.exportFormat) {
          setExportFormat(projectData.exportFormat);
        }
        if (projectData.outputDir) {
          setOutputDir(projectData.outputDir);
        }
        if (projectData.fileName) {
          setFileName(projectData.fileName);
        }

        // Restore selected directory path if it was saved
        if (projectData.selectedDirPath) {
          setSelectedDirPath(projectData.selectedDirPath);
          // Note: The directory handle cannot be restored due to browser security
          // User will need to re-select the directory when saving
        }

        setImages(loadedImages);
        setNotification(t.project.loaded);
        setTimeout(() => setNotification(null), 3000);
      } catch (error) {
        console.error('Load error:', error);
        setNotification(t.project.loadError);
        setTimeout(() => setNotification(null), 3000);
      }
    };
    reader.readAsText(file);
  }, [t.project.loaded, t.project.loadError]);

  const handleProjectFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase();
    if (ext.endsWith('.tps') || ext.endsWith('.pvr') || ext.endsWith('.pvr.ccz') || ext.endsWith('.pvr.gz')) {
      openProject(file);
    } else {
      setNotification(t.project.unsupportedFormat);
      setTimeout(() => setNotification(null), 3000);
    }
  }, [openProject, t.project.unsupportedFormat]);

  const efficiency = packedResult
    ? ((packedResult.packed.reduce((sum, item) => sum + item.width * item.height, 0) / (packedResult.width * packedResult.height)) * 100).toFixed(1)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Panel - Controls */}
      <div className="lg:col-span-4 xl:col-span-3 space-y-5">
        {/* Upload */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">📁</span>
            {t.upload.title}
          </h2>
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
              isDragging 
                ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
                : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
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
            <div className="text-3xl mb-3">🖼️</div>
            <p className="text-sm font-medium text-gray-700 mb-1">{t.upload.button}</p>
            <p className="text-xs text-gray-400">{t.upload.dragHint}</p>
          </div>
          <p className="text-xs text-gray-400 text-center mt-3">{t.upload.formats}</p>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">⚙️</span>
            {t.settings.title}
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.settings.maxWidth}</label>
                <select
                  value={settings.maxWidth}
                  onChange={(e) => setSettings({ ...settings, maxWidth: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
                >
                  {[512, 1024, 2048, 4096, 8192].map((v) => (
                    <option key={v} value={v}>{v}px</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.settings.maxHeight}</label>
                <select
                  value={settings.maxHeight}
                  onChange={(e) => setSettings({ ...settings, maxHeight: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
                >
                  {[512, 1024, 2048, 4096, 8192].map((v) => (
                    <option key={v} value={v}>{v}px</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.settings.padding}</label>
                <input
                  type="number"
                  value={settings.padding}
                  onChange={(e) => setSettings({ ...settings, padding: Number(e.target.value) })}
                  min={0}
                  max={16}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.settings.extrude}</label>
                <input
                  type="number"
                  value={settings.extrude}
                  onChange={(e) => setSettings({ ...settings, extrude: Number(e.target.value) })}
                  min={0}
                  max={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.settings.algorithm}</label>
              <select
                value={settings.algorithm}
                onChange={(e) => setSettings({ ...settings, algorithm: e.target.value as PackingAlgorithm })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
              >
                {(['maxrects-bssf', 'maxrects-blsf', 'maxrects-baf', 'shelf'] as const).map((alg) => (
                  <option key={alg} value={alg}>{t.algorithms[alg]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.settings.backgroundColor}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBgColor('transparent')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    bgColor === 'transparent' 
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300' 
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {t.settings.transparent}
                </button>
                <div className="relative">
                  <input
                    type="color"
                    value={bgColor === 'transparent' ? '#ffffff' : bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer border border-gray-200"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.allowRotation}
                    onChange={(e) => setSettings({ ...settings, allowRotation: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-500 transition"></div>
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition"></div>
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-800">{t.settings.allowRotation}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.powerOfTwo}
                    onChange={(e) => setSettings({ ...settings, powerOfTwo: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-500 transition"></div>
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition"></div>
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-800">{t.settings.powerOfTwo}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Image List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600">🗂️</span>
              {t.imageList.title}
              <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{images.length}</span>
            </h2>
            {images.length > 0 && (
              <button 
                onClick={clearAll} 
                className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition"
              >
                {t.imageList.removeAll}
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {images.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2 opacity-30">📭</div>
                <p className="text-gray-400 text-sm">{t.imageList.empty}</p>
              </div>
            ) : (
              images.map((img) => (
                <div 
                  key={img.id} 
                  className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition group"
                >
                  <div className="w-11 h-11 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                    <img src={img.url} alt={img.name} className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{img.name}</p>
                    <p className="text-xs text-gray-400">{img.width} × {img.height}</p>
                  </div>
                  <button 
                    onClick={() => removeImage(img.id)} 
                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Preview & Export */}
      <div className="lg:col-span-8 xl:col-span-9 space-y-5">
        {/* Preview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">👁️</span>
              {t.preview.title}
            </h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBorders}
                  onChange={(e) => setShowBorders(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                {t.preview.showBorders}
              </label>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="text-xs text-gray-500">{t.preview.zoom}</span>
                <input
                  type="range"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-20 accent-indigo-500"
                />
                <span className="text-xs font-medium text-gray-700 w-10">{Math.round(zoom * 100)}%</span>
              </div>
            </div>
          </div>
          <div
            className="rounded-xl min-h-[420px] overflow-auto flex items-center justify-center p-4"
            style={{
              backgroundImage: 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              backgroundColor: '#f3f4f6'
            }}
          >
            {packedResult ? (
              <div
                className="relative flex flex-col items-center"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              >
                <canvas
                  ref={canvasRef}
                  className="shadow-xl rounded-lg"
                />

                {/* Failed images displayed directly below canvas */}
                {packedResult.failed.length > 0 && (
                  <div className="flex flex-wrap gap-0">
                    {packedResult.failed.map((item) => (
                      <div
                        key={item.id}
                        className="relative border-2 border-red-500 bg-red-50/50"
                        title={`${item.name} (${item.width} × ${item.height})`}
                      >
                        <img
                          src={item.url}
                          alt={item.name}
                          className="block"
                          style={{ width: item.width, height: item.height }}
                        />
                        {/* Red overlay to indicate failure */}
                        <div className="absolute inset-0 bg-red-500/20 pointer-events-none" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-5xl mb-3 opacity-30">🎨</div>
                <p className="text-gray-400">{t.preview.empty}</p>
              </div>
            )}
          </div>
        </div>

        {/* Failed Images Warning */}
        {exceedsMaxSize && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <h3 className="text-red-800 font-semibold mb-1">Output size exceeds maximum dimensions</h3>
                <p className="text-red-600 text-sm">
                  Current size: {packedResult?.width} × {packedResult?.height} | Maximum: {settings.maxWidth} × {settings.maxHeight}
                </p>
                <p className="text-red-500 text-xs mt-1">Increase the maximum width/height in the settings or remove some images.</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {packedResult && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white">
              <p className="text-indigo-200 text-xs font-medium mb-1">{t.stats.size}</p>
              <p className="text-2xl font-bold">{packedResult.width} × {packedResult.height}</p>
              {exceedsMaxSize && <p className="text-indigo-200 text-xs mt-1">Max: {settings.maxWidth} × {settings.maxHeight}</p>}
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white">
              <p className="text-emerald-200 text-xs font-medium mb-1">{t.stats.images}</p>
              <p className="text-2xl font-bold">{packedResult.packed.length}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-5 text-white">
              <p className="text-amber-200 text-xs font-medium mb-1">{t.stats.efficiency}</p>
              <p className="text-2xl font-bold">{efficiency}%</p>
            </div>
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-5 text-white">
              <p className="text-rose-200 text-xs font-medium mb-1">{t.stats.failed}</p>
              <p className="text-2xl font-bold">{packedResult.failed.length}</p>
            </div>
          </div>
        )}

        {/* Export */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <span className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">💾</span>
              {t.export.title}
            </h2>
            {/* Project Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => projectInputRef.current?.click()}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium"
              >
                {t.project.open}
              </button>
              <button
                onClick={saveProject}
                className="text-xs px-3 py-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition font-medium"
              >
                {t.project.save}
              </button>
              <input
                ref={projectInputRef}
                type="file"
                accept=".tps,.pvr,.pvr.ccz,.pvr.gz"
                className="hidden"
                onChange={handleProjectFileSelect}
              />
            </div>
          </div>

          {/* Notification */}
          {notification && (
            <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              {notification}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.export.format}</label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
              >
                {(['json', 'json-array', 'css', 'xml', 'cocos2d', 'phaser3', 'unity'] as const).map((fmt) => (
                  <option key={fmt} value={fmt}>{t.formats[fmt]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.export.outputDir}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={selectedDirPath || 'Click to select directory'}
                  onClick={selectDirectory}
                  readOnly
                  placeholder="Click to select directory"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 cursor-pointer hover:bg-gray-100 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
                />
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="subdir"
                  className="w-24 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.export.fileName}</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="spritesheet"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
          </div>

          {/* File paths preview */}
          <div className="mb-5 p-3 bg-gray-50 rounded-lg space-y-1">
            {dirHandleRef.current && (
              <div className="text-xs text-green-600 flex items-center gap-2 mb-2">
                <span>✓</span>
                <span>Output to: <strong>{selectedDirPath}</strong></span>
              </div>
            )}
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span className="font-medium">Image:</span>
              <code className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                {selectedDirPath ? `${selectedDirPath}/` : ''}{outputDir ? `${outputDir}/` : ''}{fileName}.png
              </code>
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span className="font-medium">Data:</span>
              <code className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                {selectedDirPath ? `${selectedDirPath}/` : ''}{outputDir ? `${outputDir}/` : ''}{fileName}.{exportFormat === 'css' ? 'css' : exportFormat === 'xml' ? 'xml' : exportFormat === 'cocos2d' ? 'plist' : 'json'}
              </code>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={downloadAll}
              disabled={!packedResult}
              className="flex-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white py-3 rounded-xl font-medium hover:from-indigo-600 hover:to-indigo-700 transition shadow-sm shadow-indigo-200 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none disabled:cursor-not-allowed px-8"
            >
              {t.export.download}
            </button>
            <button
              onClick={copyData}
              disabled={!packedResult}
              className="flex-1 bg-gradient-to-r from-gray-600 to-gray-700 text-white py-3 rounded-xl font-medium hover:from-gray-700 hover:to-gray-800 transition shadow-sm shadow-gray-200 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {copied ? '✓ ' + t.export.copied : t.export.copyData}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
