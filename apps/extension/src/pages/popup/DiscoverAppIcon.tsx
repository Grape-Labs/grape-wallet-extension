import { useState } from 'react';
import { getDiscoverIconCandidates } from '../../shared/discover-logos';

export function DiscoverAppIcon(props: { name: string; url: string; faviconUrl?: string }) {
  const candidates = getDiscoverIconCandidates(props.url, props.faviconUrl);
  // Remount the image state when its source list changes, including recent-site metadata.
  return <IconSources key={JSON.stringify(candidates)} name={props.name} candidates={candidates} />;
}
function IconSources({ name, candidates }: { name: string; candidates: string[] }) {
  const [index, setIndex] = useState(0);
  const source = candidates[index];
  return <span className="discover-app-icon" aria-hidden="true">
    {source ? <img key={source} src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIndex(value => value + 1)} /> : name.slice(0, 1).toUpperCase()}
  </span>;
}
