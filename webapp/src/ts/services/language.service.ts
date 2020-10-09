import {Injectable} from '@angular/core';
import {CookieService} from "ngx-cookie";
import {TranslateService} from "@ngx-translate/core";
import * as moment from 'moment';
import {SettingsService} from './settings.service';
import {UserSettingsService} from "./user-settings.service";

const LOCALE_COOKIE_KEY = 'locale';

@Injectable({
  providedIn: 'root'
})
export class SetLanguageService {

  constructor(
    private cookieService: CookieService,
    private translateService: TranslateService
  ) { }

  /**
   * Set the language for the current session.
   * @param langCode the language code, eg. 'en', 'es' ...
   */
  setLanguageCookie(langCode: string): string {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear()+1);
    this.cookieService.put(LOCALE_COOKIE_KEY, langCode, { expires: nextYear, path: '/' });
    return langCode;
  }

  setLanguage(code, setLanguageCookie?) {
    moment.locale([code, 'en']);
    this.setDatepickerLanguage(code);
    this.translateService.use(code);
    if (setLanguageCookie !== false) {
      this.setLanguageCookie(code);
    }
  }

  private setDatepickerLanguage(language: string) {
    //TODO Uncomment the code below once fn.datepicker is migrated
    //     to Angular 10
    //const availableCalendarLanguages = Object.keys((<any>$.fn).datepicker.dates);
    //const calendarLanguage = availableCalendarLanguages.indexOf(language) >= 0 ? language : 'en';
    //(<any>$.fn).datepicker.defaults.language = calendarLanguage;
  }
}

@Injectable({
  providedIn: 'root'
})
export class LanguageService {

  constructor(
    private setLanguageService: SetLanguageService,
    private settingsService: SettingsService,
    private userSettingsService: UserSettingsService,
    private cookieService: CookieService,
  ) { }

  set() {
    const cookieVal = this.cookieService.get(LOCALE_COOKIE_KEY);
    if (cookieVal) {
      return Promise.resolve(cookieVal);
    }
    return this.fetchLocale()
      .then((locale: string) => this.setLanguageService.setLanguageCookie(locale));
  }

  private fetchLocale(): Promise<any> {
    return this.userSettingsService.get()
      .then((user: any) => {
        if (user && user.language) {
          return user.language;
        }
        return this.settingsService.get()
          .then((settings: any) => settings.locale || 'en');
      });
  };
}
