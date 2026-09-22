// Web app config for the production project. These values are public by design
// (they identify the project, they are not secrets); access is enforced by
// security rules and App Check.
export const firebaseConfig = {
  apiKey: 'AIzaSyDlv1dTUCssKYR-PF5IXTUK7C7ch0y9Ylo',
  // The app's own domain, so Google sign-in stays first-party (Safari blocks
  // cross-domain auth storage).
  authDomain: 'photowall-gdgocsgu.web.app',
  projectId: 'photowall-gdgoc-2026',
  storageBucket: 'photowall-gdgoc-2026.firebasestorage.app',
  messagingSenderId: '796758665431',
  appId: '1:796758665431:web:d1494a73c0cec9adc2a892',
};

/** reCAPTCHA Enterprise site key for App Check (`ReCaptchaEnterpriseProvider`). */
export const recaptchaSiteKey = '6LfKQcgtAAAAABknOI4uc5-qUZ65XYDRFMX06Mzi';
