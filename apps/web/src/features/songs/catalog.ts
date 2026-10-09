import type { Song } from '@sonara/shared'
import { readSongBytes } from './read-song'

/**
 * The songs that come with Sonara: the same for everyone, and there before
 * anything has been imported.
 *
 * Each is a score in `public/songs`, named for its id, and is read through the
 * same importer as a file the player brings. Nothing here is a second way to
 * make a song: a built-in piece gets its hands, its bars and its fingering
 * exactly as an imported one does, and an improvement to the importer reaches
 * all of them without a file being touched.
 *
 * They are fetched one at a time, when chosen. All of them together are a
 * megabyte and a half that nobody wants on the way to a scale, and a parsed
 * song is far larger than its file, which is why none is kept in storage
 * either: the library in `localStorage` is for what the player brought.
 *
 * The scores are the MuseTrainer library's. Where it holds the same piece
 * twice, both are here and the second says what sets it apart, or failing
 * anything better, that it is another version.
 */

export type SongStyle =
  | 'baroque'
  | 'classical'
  | 'romantic'
  | 'impressionist'
  | 'ragtime'
  | 'traditional'
  | 'contemporary'

/** The styles, in the order the chooser lists them: by period, then the rest. */
export const SONG_STYLES: readonly { readonly id: SongStyle; readonly label: string }[] = [
  { id: 'baroque', label: 'Baroque' },
  { id: 'classical', label: 'Classical' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'impressionist', label: 'Impressionist' },
  { id: 'ragtime', label: 'Ragtime' },
  { id: 'traditional', label: 'Traditional & Holiday' },
  { id: 'contemporary', label: 'Contemporary' },
]

export interface CatalogSong {
  /** Also the name of its score: `public/songs/<id>.mxl`. */
  readonly id: string
  readonly title: string
  readonly composer: string
  readonly style: SongStyle
  /** What sets this score apart, where the piece is here more than once. */
  readonly edition?: string
}

export const SONG_CATALOG: readonly CatalogSong[] = [
  {
    id: 'bach-air-on-the-g-string',
    title: 'Air on the G String',
    composer: 'Johann Sebastian Bach',
    style: 'baroque',
  },
  {
    id: 'bach-prelude-in-c-major-bwv-846',
    title: 'Prelude in C Major, BWV 846',
    composer: 'Johann Sebastian Bach',
    style: 'baroque',
  },
  {
    id: 'bach-prelude-in-c-minor-bwv-847',
    title: 'Prelude in C Minor, BWV 847',
    composer: 'Johann Sebastian Bach',
    style: 'baroque',
  },
  {
    id: 'bach-toccata-and-fugue-in-d-minor',
    title: 'Toccata and Fugue in D Minor, BWV 565',
    composer: 'Johann Sebastian Bach',
    style: 'baroque',
  },
  {
    id: 'handel-halvorsen-passacaglia',
    title: 'Passacaglia',
    composer: 'George Frideric Handel, arr. Johan Halvorsen',
    style: 'baroque',
  },
  {
    id: 'pachelbel-canon-in-d',
    title: 'Canon in D',
    composer: 'Johann Pachelbel',
    style: 'baroque',
  },
  {
    id: 'pachelbel-canon-in-d-danao',
    title: 'Canon in D',
    composer: 'Johann Pachelbel',
    style: 'baroque',
    edition: 'Arr. Jacob Danao',
  },
  {
    id: 'pachelbel-canon-in-d-easy',
    title: 'Canon in D',
    composer: 'Johann Pachelbel',
    style: 'baroque',
    edition: 'Easy',
  },
  {
    id: 'petzold-minuet-in-g-major',
    title: 'Minuet in G Major, BWV Anh. 114',
    composer: 'Christian Petzold',
    style: 'baroque',
  },
  {
    id: 'petzold-minuet-in-g-major-2',
    title: 'Minuet in G Major, BWV Anh. 114',
    composer: 'Christian Petzold',
    style: 'baroque',
    edition: 'Version 2',
  },
  {
    id: 'beethoven-danse-villageoise',
    title: 'Danse Villageoise No. 2',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
  },
  {
    id: 'beethoven-fur-elise',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
  },
  {
    id: 'beethoven-fur-elise-fingered',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
    edition: 'With fingering',
  },
  {
    id: 'beethoven-fur-elise-easy',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
    edition: 'Easy',
  },
  {
    id: 'beethoven-fur-elise-beginner',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
    edition: 'Beginner',
  },
  {
    id: 'beethoven-moonlight-sonata-1',
    title: 'Moonlight Sonata, 1st Movement',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
  },
  {
    id: 'beethoven-moonlight-sonata-3',
    title: 'Moonlight Sonata, 3rd Movement',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
  },
  {
    id: 'beethoven-moonlight-sonata-3-2',
    title: 'Moonlight Sonata, 3rd Movement',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
    edition: 'Version 2',
  },
  {
    id: 'beethoven-ode-to-joy-easy',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
    edition: 'Easy',
  },
  {
    id: 'beethoven-pathetique-sonata-2',
    title: 'Pathétique Sonata, 2nd Movement',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
  },
  {
    id: 'beethoven-symphony-no-5-1',
    title: 'Symphony No. 5, 1st Movement',
    composer: 'Ludwig van Beethoven',
    style: 'classical',
    edition: 'Piano solo',
  },
  {
    id: 'mozart-lacrimosa',
    title: 'Lacrimosa, from the Requiem',
    composer: 'Wolfgang Amadeus Mozart',
    style: 'classical',
  },
  {
    id: 'mozart-sonata-no-16-k-545-1',
    title: 'Sonata No. 16 in C Major, K. 545, 1st Movement',
    composer: 'Wolfgang Amadeus Mozart',
    style: 'classical',
  },
  {
    id: 'mozart-sonata-no-16-k-545-1-2',
    title: 'Sonata No. 16 in C Major, K. 545, 1st Movement',
    composer: 'Wolfgang Amadeus Mozart',
    style: 'classical',
    edition: 'Version 2',
  },
  {
    id: 'mozart-turkish-march',
    title: 'Turkish March (Rondo alla Turca)',
    composer: 'Wolfgang Amadeus Mozart',
    style: 'classical',
  },
  {
    id: 'mozart-turkish-march-fingered',
    title: 'Turkish March (Rondo alla Turca)',
    composer: 'Wolfgang Amadeus Mozart',
    style: 'classical',
    edition: 'With fingering',
  },
  {
    id: 'mozart-twinkle-variations',
    title: 'Twinkle, Twinkle, Little Star: 12 Variations',
    composer: 'Wolfgang Amadeus Mozart',
    style: 'classical',
  },
  {
    id: 'brahms-hungarian-dance-no-5',
    title: 'Hungarian Dance No. 5 in G Minor',
    composer: 'Johannes Brahms',
    style: 'romantic',
  },
  {
    id: 'chopin-ballade-no-1',
    title: 'Ballade No. 1 in G Minor, Op. 23',
    composer: 'Frédéric Chopin',
    style: 'romantic',
  },
  {
    id: 'chopin-nocturne-op-9-no-1',
    title: 'Nocturne in B-flat Minor, Op. 9 No. 1',
    composer: 'Frédéric Chopin',
    style: 'romantic',
  },
  {
    id: 'chopin-nocturne-op-9-no-2',
    title: 'Nocturne in E-flat Major, Op. 9 No. 2',
    composer: 'Frédéric Chopin',
    style: 'romantic',
  },
  {
    id: 'chopin-nocturne-op-9-no-2-easy',
    title: 'Nocturne in E-flat Major, Op. 9 No. 2',
    composer: 'Frédéric Chopin',
    style: 'romantic',
    edition: 'Easy',
  },
  {
    id: 'chopin-nocturne-no-20',
    title: 'Nocturne No. 20 in C-sharp Minor',
    composer: 'Frédéric Chopin',
    style: 'romantic',
  },
  {
    id: 'chopin-nocturne-no-20-2',
    title: 'Nocturne No. 20 in C-sharp Minor',
    composer: 'Frédéric Chopin',
    style: 'romantic',
    edition: 'Version 2',
  },
  {
    id: 'chopin-prelude-op-28-no-4',
    title: 'Prelude in E Minor, Op. 28 No. 4',
    composer: 'Frédéric Chopin',
    style: 'romantic',
  },
  {
    id: 'chopin-prelude-op-28-no-4-2',
    title: 'Prelude in E Minor, Op. 28 No. 4',
    composer: 'Frédéric Chopin',
    style: 'romantic',
    edition: 'Version 2',
  },
  {
    id: 'chopin-waltz-in-a-minor',
    title: 'Waltz in A Minor, B. 150',
    composer: 'Frédéric Chopin',
    style: 'romantic',
  },
  {
    id: 'chopin-waltz-op-64-no-2',
    title: 'Waltz in C-sharp Minor, Op. 64 No. 2',
    composer: 'Frédéric Chopin',
    style: 'romantic',
  },
  { id: 'liszt-la-campanella', title: 'La Campanella', composer: 'Franz Liszt', style: 'romantic' },
  {
    id: 'liszt-liebestraum-no-3',
    title: 'Liebestraum No. 3 in A-flat Major',
    composer: 'Franz Liszt',
    style: 'romantic',
  },
  {
    id: 'rimsky-korsakov-flight-of-the-bumblebee',
    title: 'Flight of the Bumblebee',
    composer: 'Nikolai Rimsky-Korsakov',
    style: 'romantic',
  },
  { id: 'schubert-ave-maria', title: 'Ave Maria', composer: 'Franz Schubert', style: 'romantic' },
  {
    id: 'schubert-serenade',
    title: 'Serenade (Ständchen)',
    composer: 'Franz Schubert, arr. Franz Liszt',
    style: 'romantic',
  },
  {
    id: 'tchaikovsky-dance-of-the-sugar-plum-fairy',
    title: 'Dance of the Sugar Plum Fairy',
    composer: 'Pyotr Ilyich Tchaikovsky',
    style: 'romantic',
  },
  {
    id: 'tchaikovsky-swan-lake',
    title: 'Swan Lake',
    composer: 'Pyotr Ilyich Tchaikovsky',
    style: 'romantic',
  },
  {
    id: 'tchaikovsky-waltz-of-the-flowers',
    title: 'Waltz of the Flowers',
    composer: 'Pyotr Ilyich Tchaikovsky',
    style: 'romantic',
  },
  {
    id: 'debussy-arabesque-no-1',
    title: 'Arabesque No. 1 in E Major',
    composer: 'Claude Debussy',
    style: 'impressionist',
  },
  {
    id: 'debussy-clair-de-lune',
    title: 'Clair de Lune',
    composer: 'Claude Debussy',
    style: 'impressionist',
  },
  {
    id: 'debussy-clair-de-lune-2',
    title: 'Clair de Lune',
    composer: 'Claude Debussy',
    style: 'impressionist',
    edition: 'Version 2',
  },
  {
    id: 'satie-gnossienne-no-1',
    title: 'Gnossienne No. 1',
    composer: 'Erik Satie',
    style: 'impressionist',
  },
  {
    id: 'satie-gymnopedie-no-1',
    title: 'Gymnopédie No. 1',
    composer: 'Erik Satie',
    style: 'impressionist',
  },
  {
    id: 'satie-gymnopedie-no-1-2',
    title: 'Gymnopédie No. 1',
    composer: 'Erik Satie',
    style: 'impressionist',
    edition: 'Version 2',
  },
  {
    id: 'joplin-the-entertainer',
    title: 'The Entertainer',
    composer: 'Scott Joplin',
    style: 'ragtime',
  },
  {
    id: 'joplin-the-entertainer-2',
    title: 'The Entertainer',
    composer: 'Scott Joplin',
    style: 'ragtime',
    edition: 'Version 2',
  },
  {
    id: 'joplin-maple-leaf-rag',
    title: 'Maple Leaf Rag',
    composer: 'Scott Joplin',
    style: 'ragtime',
  },
  { id: 'bella-ciao', title: 'Bella Ciao', composer: 'Traditional', style: 'traditional' },
  {
    id: 'bella-ciao-lefebvre',
    title: 'Bella Ciao',
    composer: 'Traditional',
    style: 'traditional',
    edition: 'Arr. Sami Lefebvre',
  },
  {
    id: 'carol-of-the-bells',
    title: 'Carol of the Bells',
    composer: 'Mykola Leontovych',
    style: 'traditional',
  },
  {
    id: 'carol-of-the-bells-easy',
    title: 'Carol of the Bells',
    composer: 'Mykola Leontovych',
    style: 'traditional',
    edition: 'Easy',
  },
  { id: 'greensleeves', title: 'Greensleeves', composer: 'Traditional', style: 'traditional' },
  {
    id: 'happy-birthday-to-you',
    title: 'Happy Birthday to You',
    composer: 'Patty and Mildred J. Hill',
    style: 'traditional',
  },
  {
    id: 'happy-birthday-to-you-easy',
    title: 'Happy Birthday to You',
    composer: 'Patty and Mildred J. Hill',
    style: 'traditional',
    edition: 'Easy',
  },
  { id: 'luo-ni-g-minor-bach', title: 'G Minor Bach', composer: 'Luo Ni', style: 'contemporary' },
  {
    id: 'luo-ni-g-minor-bach-2',
    title: 'G Minor Bach',
    composer: 'Luo Ni',
    style: 'contemporary',
    edition: 'Version 2',
  },
  {
    id: 'senneville-hungarian-sonata',
    title: 'Hungarian Sonata',
    composer: 'Paul de Senneville',
    style: 'contemporary',
  },
  {
    id: 'senneville-mariage-d-amour',
    title: "Mariage d'Amour",
    composer: 'Paul de Senneville',
    style: 'contemporary',
  },
  {
    id: 'senneville-mariage-d-amour-2',
    title: "Mariage d'Amour",
    composer: 'Paul de Senneville',
    style: 'contemporary',
    edition: 'Version 2',
  },
  {
    id: 'senneville-mariage-d-amour-3',
    title: "Mariage d'Amour",
    composer: 'Paul de Senneville',
    style: 'contemporary',
    edition: 'Version 3',
  },
]

/** The id a built-in song has once it is open, which no imported song can have. */
export const catalogSongId = (entry: CatalogSong): string => `catalog:${entry.id}`

/** What the song is called everywhere outside the chooser, where it stands alone. */
export const catalogSongTitle = (entry: CatalogSong): string =>
  entry.edition ? `${entry.title} (${entry.edition})` : entry.title

/**
 * Fetches a built-in song and reads it.
 *
 * It takes the catalog's title rather than the file's: the scores were
 * engraved by many hands, and call themselves "Song", "Ballade I" and nothing
 * at all.
 */
export async function loadCatalogSong(entry: CatalogSong, signal?: AbortSignal): Promise<Song> {
  const name = `${entry.id}.mxl`
  const response = await fetch(`${import.meta.env.BASE_URL}songs/${name}`, { signal })
  if (!response.ok) throw new Error(`${name} answered ${response.status}`)
  const result = readSongBytes(new Uint8Array(await response.arrayBuffer()), name)
  if (!('song' in result)) throw new Error(`${name} could not be read: ${result.failure}`)
  return { ...result.song, id: catalogSongId(entry), title: catalogSongTitle(entry) }
}
