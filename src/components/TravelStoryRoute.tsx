import type { TravelStory } from '@/types/blog';

export default function TravelStoryRoute({ story }: { story: TravelStory | null | undefined }) {
  const route = story?.route ?? [];
  if (route.length === 0) return null;

  return (
    <section className="p-4 mt-4 bg-white shadow-md rounded-2xl">
      <h3 className="text-lg font-black text-slate-900">여행 동선</h3>
      <p className="mt-1 text-sm text-slate-500">{story?.summary}</p>
      <div className="mt-3 text-center">
        {route.map((place, index) => (
          <div key={`${place}-${index}`}>
            <p className="text-base font-bold text-slate-900">{place}</p>
            {index < route.length - 1 && <p className="py-1 text-slate-400">↓</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
