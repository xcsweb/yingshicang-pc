export const filterM3u8Ads = (manifest: string): string => {
  const isVOD = manifest.includes('#EXT-X-ENDLIST');
  const chunks = manifest.split('#EXT-X-DISCONTINUITY');
  if (chunks.length <= 1) return manifest;

  type ChunkInfo = { raw: string; duration: number; segmentCount: number; isAd: boolean; };

  const parsedChunks: ChunkInfo[] = chunks.map(chunk => {
    const infs = [...chunk.matchAll(/#EXTINF:\s*([\d.]+)\s*,/g)];
    const duration = infs.reduce((sum, match) => sum + parseFloat(match[1]), 0);
    return { raw: chunk, duration, segmentCount: infs.length, isAd: false };
  });

  const totalDuration = parsedChunks.reduce((sum, c) => sum + c.duration, 0);

  // 只有在 VOD 点播（有时长）且总时长较长时，才进行激进过滤
  if (isVOD && totalDuration > 120) {
    parsedChunks.forEach((chunk) => {
      // 广告通常以独立块出现，时长较短（< 60秒），包含的切片数量很少
      if (chunk.duration > 0 && chunk.duration < 60 && chunk.segmentCount > 0 && chunk.segmentCount <= 15) {
        chunk.isAd = true;
      }
    });
  }

  const validChunks = parsedChunks.filter(c => !c.isAd).map(c => c.raw);
  // 重新用断点拼接，并清理可能多余的连续 DISCONTINUITY
  return validChunks.join('\n#EXT-X-DISCONTINUITY\n').replace(/(#EXT-X-DISCONTINUITY\s*)+/g, '#EXT-X-DISCONTINUITY\n');
};
