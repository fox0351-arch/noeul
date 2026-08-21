import { NextRequest, NextResponse } from 'next/server';
import { PlaceDetails, PlaceReview } from '@/types/place';

const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'editorialSummary',
  'photos',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'reviews',
].join(',');

function toPlaceId(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('places/') ? trimmed.slice('places/'.length) : trimmed;
}

function buildBlogSummary(input: {
  name: string;
  address: string;
  rating?: number;
  userRatingCount?: number;
  description?: string;
  openingHours: string[];
  reviews: PlaceReview[];
}): string {
  const lines: string[] = [];
  lines.push(`${input.name}은(는) ${input.address || '이 지역'}에 있는 여행 명소입니다.`);

  if (input.rating) {
    const count = input.userRatingCount ? ` (${input.userRatingCount}명 평가)` : '';
    lines.push(`방문객 평점은 ★${input.rating}점${count}입니다.`);
  }

  if (input.description) {
    lines.push(input.description);
  } else if (input.reviews[0]?.text) {
    const snippet = input.reviews[0].text.replace(/\s+/g, ' ').slice(0, 90);
    lines.push(`최근 방문객은 “${snippet}${input.reviews[0].text.length > 90 ? '…' : ''}”라고 남겼습니다.`);
  }

  if (input.openingHours[0]) {
    lines.push(`운영 안내는 ${input.openingHours[0]}입니다.`);
  }

  return lines.join(' ');
}

async function resolvePhotoUrl(photoName: string | undefined, apiKey: string): Promise<string | undefined> {
  if (!photoName) return undefined;

  const mediaUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  mediaUrl.searchParams.set('maxHeightPx', '800');
  mediaUrl.searchParams.set('skipHttpRedirect', 'true');

  const mediaRes = await fetch(mediaUrl.toString(), {
    headers: { 'X-Goog-Api-Key': apiKey },
  });

  if (!mediaRes.ok) return undefined;
  const media = await mediaRes.json();
  return typeof media.photoUri === 'string' ? media.photoUri : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const rawId = req.nextUrl.searchParams.get('id');
    if (!rawId) {
      return NextResponse.json({ error: '장소 id가 필요합니다.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const placeId = encodeURIComponent(toPlaceId(rawId));
    const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}?languageCode=ko`;

    const response = await fetch(detailsUrl, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': DETAILS_FIELD_MASK,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `구글 오류: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    const reviews: PlaceReview[] = (data.reviews || [])
      .slice(0, 3)
      .map((review: any) => ({
        author: review.authorAttribution?.displayName || '방문자',
        rating: review.rating,
        text: review.text?.text || '',
        relativeTime: review.relativePublishTimeDescription,
      }))
      .filter((review: PlaceReview) => review.text);

    const openingHours: string[] = data.regularOpeningHours?.weekdayDescriptions || [];
    const description = data.editorialSummary?.text || '';
    const name = data.displayName?.text || '이름 없음';
    const address = data.formattedAddress || '';
    const photoUrl = await resolvePhotoUrl(data.photos?.[0]?.name, apiKey);

    const result: PlaceDetails = {
      id: data.id || toPlaceId(rawId),
      name,
      address,
      rating: data.rating,
      userRatingCount: data.userRatingCount,
      description: description || undefined,
      photoUrl,
      openingHours,
      phone: data.nationalPhoneNumber || data.internationalPhoneNumber,
      website: data.websiteUri,
      reviews,
      blogSummary: buildBlogSummary({
        name,
        address,
        rating: data.rating,
        userRatingCount: data.userRatingCount,
        description: description || undefined,
        openingHours,
        reviews,
      }),
    };

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 });
  }
}
