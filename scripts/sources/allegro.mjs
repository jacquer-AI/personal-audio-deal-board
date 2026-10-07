import {parseGenericOffer} from './generic.mjs';

/** Allegro ad pages are bot-protected: parse only what is explicitly served, never infer a price. */
export default {id:'allegro',parse:parseGenericOffer};
