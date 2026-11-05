/** Extract one video ID from an allowlisted YouTube HTTPS URL; never accept embed HTML. */
export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    if (/^\/embed\/videoseries\/?$/.test(url.pathname)) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') {
      const match = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
      id = match?.[1] ?? null;
    } else if (
      [
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
      ].includes(url.hostname)
    ) {
      if (url.pathname === '/watch') {
        if (url.searchParams.getAll('v').length !== 1) return null;
        id = url.searchParams.get('v');
      } else {
        id =
          url.pathname.match(
            /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/,
          )?.[1] ?? null;
      }
    } else if (
      ['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(
        url.hostname,
      )
    ) {
      id = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function canonicalYoutubeUrl(value: string): string | null {
  const id = youtubeVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
