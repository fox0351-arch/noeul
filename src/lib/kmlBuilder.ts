import { PlaceItem } from '@/types/place';

export function generateKML(mapTitle: string, places: PlaceItem[]): string {
  const placemarks = places
    .map((place) => {
      const memoHtml = place.memo?.trim()
        ? `<p><strong>메모:</strong> ${escapeXml(place.memo.trim()).replace(/\n/g, '<br/>')}</p>`
        : '';
      const description = `
        <![CDATA[
          <h3>${place.name}</h3>
          <p><strong>주소:</strong> ${place.address}</p>
          <p><strong>평점:</strong> ★ ${place.rating ?? '정보 없음'}</p>
          ${memoHtml}
        ]]>
      `.trim();

      const coordinates = `${place.location.longitude},${place.location.latitude},0`;

      return `
    <Placemark>
      <name>${escapeXml(place.name)}</name>
      <description>${description}</description>
      <Point>
        <coordinates>${coordinates}</coordinates>
      </Point>
    </Placemark>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(mapTitle)}</name>
    <description>노을 My Maps 자동 생성기 V0.1</description>
    <Folder>
      <name>주요 관광지</name>
      ${placemarks}
    </Folder>
  </Document>
</kml>`;
}

export function downloadKmlFile(filename: string, kmlContent: string): void {
  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.kml') ? filename : `${filename}.kml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}