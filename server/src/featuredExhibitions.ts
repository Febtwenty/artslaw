/**
 * Featured exhibitions shown to new users on the home page and Discover page.
 *
 * HOW TO FIND AN EXHIBITION:
 *   1. Go to https://www.contemporaryartlibrary.org and browse or search for an exhibition
 *   2. Open the exhibition page — the URL will look like:
 *      https://www.contemporaryartlibrary.org/project/artist-name-at-gallery-city-12345
 *   3. To get the image URL: right-click the main photo → "Copy image address"
 *      It should start with https://cdn.contemporaryartlibrary.org/...
 *      Leave imageUrl as null if you don't want a thumbnail.
 *
 * The first 3 entries are shown on the home page. All entries appear on the Discover page.
 * Add, remove, or reorder entries freely — changes take effect on next server restart.
 */

export const FEATURED_EXHIBITIONS = [
  {
    artistName: 'Philipp Timischl',
    exhibitionTitle: 'Dummodo me ames',
    gallery: 'St. Andrew‘s Church',
    city: 'Salzburg',
    dates: 'Jul 26 – Aug 31, 2025',
    url: 'https://www.contemporaryartlibrary.org/project/philipp-timischl-at-layr-57968?from=%2Fartist%2Fphilipp-timischl-15934',
    imageUrl: 'https://cdn.contemporaryartlibrary.org/store/image/906780/imagefile/caq_thumb-4e77927e402472fe2fe39a72402d94c2.jpg',
  },
  {
    artistName: 'Carolyn Lazard',
    exhibitionTitle: 'Corpus',
    gallery: 'Trautwein Herleth',
    city: 'Berlin',
    dates: 'Sep 12 – Oct 18, 2025',
    url: 'https://www.contemporaryartlibrary.org/project/carolyn-lazard-at-trautwein-herleth-berlin-59613?from=%2Fvenue%2Ftrautwein-herleth-7532',
    imageUrl: 'https://cdn.contemporaryartlibrary.org/store/image/924725/imagefile/caq_thumb-aca5d462833244b0fa1d7286befffc14.jpg',
  },
  {
    artistName: 'Hanna Hur',
    exhibitionTitle: 'Visitor',
    gallery: 'Sweetwater',
    city: 'Berlin',
    dates: 'Sep 10 – Oct 18, 2025',
    url: 'https://www.contemporaryartlibrary.org/project/hanna-hur-at-sweetwater-berlin-59435?from=%2Fvenue%2Fsweetwater-9354',
    imageUrl: 'https://cdn.contemporaryartlibrary.org/store/image/914239/imagefile/caq_thumb-3abe1f874a1260a964e81e4f3cadfb0d.jpg',
  },
  {
    artistName: 'Wolfgang Tillmans',
    exhibitionTitle: 'Saros',
    gallery: 'Galerie Buchholz',
    city: 'Cologne',
    dates: 'Mar 26 – Apr 21, 1999',
    url: 'https://www.contemporaryartlibrary.org/project/wolfgang-tillmans-at-galerie-buchholz-cologne-2162',
    imageUrl: 'https://cdn.contemporaryartlibrary.org/store/image/303465/imagefile/medium-4a7680de73b45f6aa169dedc7da904ab.jpg',
  },
];
