import { writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { sniffUpload } from 'src/common/helper/upload-files';
import { placeholderPng, wrapText } from './placeholder-image';

describe('placeholderPng', () => {
  it('makes a PNG the upload checks accept, at the size asked for', () => {
    const png = placeholderPng({ title: 'Catering & Food', subtitle: 'Southern Buffet Dinner', colors: ['#7A3E12', '#E8A33D'], width: 300, height: 200 });
    expect(sniffUpload(png, ['image'])).toBe('png');
    expect(png.readUInt32BE(16)).toBe(300);
    expect(png.readUInt32BE(20)).toBe(200);
    // the IDAT chunk holds every row: a filter byte plus 3 bytes per pixel
    const idatLen = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString('latin1')).toBe('IDAT');
    expect(inflateSync(png.subarray(41, 41 + idatLen)).length).toBe(200 * (300 * 3 + 1));
    if (process.env.PNG_OUT) writeFileSync(process.env.PNG_OUT, placeholderPng({ title: 'Photography & Video', subtitle: 'Wedding Day Coverage - 8 Hours', colors: ['#3B1F5C', '#C2549D'] }));
  });

  it('wraps long text and drops characters it can’t draw', () => {
    expect(wrapText('Photography & Video', 30)).toEqual(['PHOTOGRAPHY & VIDEO']);
    expect(wrapText('Photography & Video', 12)).toEqual(['PHOTOGRAPHY', '& VIDEO']);
    expect(wrapText('Café – brunch!', 20)).toEqual(['CAF BRUNCH']);
    expect(wrapText('one two three four five six', 9, 2)).toEqual(['ONE TWO', 'THREE...']);
  });
});
