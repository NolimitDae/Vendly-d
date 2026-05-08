import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'platform-settings.json');

const DEFAULTS = {
  platformFee: '10',
  currency: 'USD',
  minBookingAmount: '100',
  maxBookingAmount: '1000',
  timezone: 'GMT+0',
};

@Injectable()
export class SettingsService {
  private read(): Record<string, string> {
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
      }
    } catch {
      // fall through to defaults
    }
    return { ...DEFAULTS };
  }

  getSettings() {
    return { success: true, data: this.read() };
  }

  updateSettings(updates: Record<string, string>) {
    const current = this.read();
    const next = { ...current, ...updates };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
    return { success: true, data: next };
  }
}
