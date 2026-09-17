import { markSoloApp } from './common/app-variant';

/** Must be the first import from solo-main so isSoloApp() is true while Nest modules load. */
markSoloApp();
