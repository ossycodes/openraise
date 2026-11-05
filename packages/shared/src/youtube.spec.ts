import { describe, it, expect } from 'vitest';
import { canonicalYoutubeUrl, youtubeVideoId } from './youtube.js';
const id = 'M7lc1UVf-VE';
describe('YouTube campaign URLs', () => {
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PLexample&t=15&autoplay=1`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=tracking`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ])('canonicalizes %s without retaining third-party parameters', (url) => {
    expect(youtubeVideoId(url)).toBe(id);
    expect(canonicalYoutubeUrl(url)).toBe(
      `https://www.youtube.com/watch?v=${id}`,
    );
  });
  it.each([
    '',
    id,
    '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>',
    'javascript:alert(1)',
    'https://evil.example/watch?v=M7lc1UVf-VE',
    'https://www.youtube.com.evil.example/watch?v=M7lc1UVf-VE',
    'https://www.youtube.com@evil.example/watch?v=M7lc1UVf-VE',
    'https://user:password@www.youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com:444/watch?v=M7lc1UVf-VE',
    'http://youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com/playlist?list=PLexample',
    'https://youtube.com/watch?v=bad',
    'https://youtube.com/watch?v=M7lc1UVf-VE&v=AAAAAAAAAAA',
    'https://youtu.be/M7lc1UVf-VE/extra',
    'https://youtube-nocookie.com/watch?v=M7lc1UVf-VE',
    'https://www.youtube.com/embed/videoseries?list=PLexample',
  ])('rejects unsupported input %s', (url) => {
    expect(youtubeVideoId(url)).toBeNull();
    expect(canonicalYoutubeUrl(url)).toBeNull();
  });
});
