// English — source of truth for interface translations (docs/i18n-requirements.md).
// Every other language file (sk.ts, de.ts, ru.ts, uk.ts) is typed against
// `Translations` (derived below), so a missing or mistyped key fails the
// build instead of silently falling back or crashing at runtime. Grouped by
// screen/component, mirroring src/features/ and src/components/ — not a
// flat dot-path key scheme, so every call site is a plain, autocompletable
// object access (`t.welcome.print`, not `t('welcome.print')`).
export const en = {
  common: {
    back: 'Back',
    home: 'Home',
    close: 'Close',
    confirm: 'Confirm',
    paperSizeA4: 'A4',
    paperSizeA5: 'A5',
    sidesSingle: 'Single-sided',
    sidesDouble: 'Double-sided',
    colorBw: 'Black & white',
    colorColor: 'Color',
    comingSoon: 'Coming soon',
    unavailable: 'Unavailable',
    tapToConfigurePrinting: 'Tap to configure printing',
    scanningForViruses: 'Scanning for viruses...',
    preparingForPrint: 'Preparing for print...',
    configureAllFiles: 'Configure printing for all files',
    blockedVirusScan: 'Blocked — failed virus scan',
  },
  footer: {
    callOperator: 'Call operator',
    help: 'Help',
    tariffs: 'Tariffs',
    account: 'Account',
    cart: 'Cart',
    language: 'Language',
  },
  kioskLayout: {
    endSession: 'Finish and clear data',
    endSessionConfirmMessage: 'End this session and clear all your data?',
    connectionLostTitle: 'Connection lost',
    connectionLostMessage:
      "The kiosk has lost its connection. Payment and printing are unavailable until it's restored.",
    idleWarningTitle: 'Still there?',
    idleWarningMessage:
      'This session will end in 1 minute due to inactivity. Tap anywhere to continue.',
    paidOrdersPromptMessage: "You have an order paid in advance that's awaiting print.",
    goToMyOrders: 'Go to My orders',
    selectLanguage: 'Select language',
  },
  cart: {
    empty: 'Cart is empty',
    title: 'Cart',
    qty: (quantity: number) => `Qty: ${quantity}`,
    total: (amount: string) => `Total: $${amount}`,
    proceedToPayment: 'Proceed to payment',
  },
  login: {
    checkYourEmail: 'Check your email',
    resetInstructionsSent:
      'If an account with that email exists, password reset instructions have been sent.',
    backToLogin: 'Back to log in',
    resetPassword: 'Reset password',
    email: 'Email',
    password: 'Password',
    sendResetInstructions: 'Send reset instructions',
    logIn: 'Log in',
    incorrectCredentials: 'Incorrect email or password.',
    forgotPassword: 'Forgot password?',
  },
  welcome: {
    print: 'Print',
    scan: 'Scan',
    copy: 'Copy',
    serviceUnavailableTitle: 'Service unavailable',
    serviceUnavailableMessage:
      'Printing is temporarily unavailable. Please try again later or contact an operator.',
  },
  uploadMethodSelection: {
    instruction: "Select how you'd like to upload your document for printing",
    qrTitle: 'QR code',
    qrDescription: 'Use your phone',
    emailTitle: 'Email',
    emailDescription: 'Send your file',
    accountTitle: 'Personal account',
    accountDescription: 'Your saved files',
    telegramTitle: 'Telegram',
    telegramDescription: 'Use the bot',
    webTitle: 'Web page',
    webDescription: 'Open online',
    usbTitle: 'USB drive',
    usbDescription: 'Connect your drive',
  },
  emailAddress: {
    instruction: 'Send your document as an email attachment to the address below',
    acceptedFormats: 'Accepted formats: PDF, DOC, DOCX, JPG, PNG',
    next: 'Next',
  },
  emailFileList: {
    instruction: 'Select an email to see its attachments',
    attachmentCount: (count: number) => `${count} attachment(s)`,
  },
  qrUpload: {
    qrImageAlt: 'QR code to upload files from your phone',
    preparingQrCode: 'Preparing QR code...',
    qrHint: "Scan with your phone's camera, then upload your file(s) from the page that opens",
    waitingForFiles: 'Waiting for files...',
  },
  personalAccount: {
    myFiles: 'My files',
    myOrders: 'My orders',
    logOut: 'Log out',
    backToMyFiles: 'Back to My files',
    configureSelected: 'Configure printing for selected files',
    noOrdersAwaitingPrint: 'No orders awaiting print.',
    orderDescription: (quantity: number) => `Qty ${quantity} · Paid — tap to add to cart`,
  },
  printOrderConfiguration: {
    paperSizeLegend: 'Paper size',
    sidesLegend: 'Sides',
    colorLegend: 'Color',
    quantity: 'Quantity',
    price: (amount: string) => `Price: $${amount}`,
    addToCart: 'Add to cart',
  },
  paymentStatus: {
    cancelPayment: 'Cancel payment',
    cancelConfirmMessage: 'Are you sure you want to cancel this order?',
  },
  printStatus: {
    printingMessage: 'Printing your document(s)...',
    succeededMessage: 'Your document(s) printed successfully.',
    continueLabel: 'Continue',
    retry: 'Retry',
    errorPrinterNotFound: 'No printer is available. Please check the printer and retry.',
    errorPaperJam: 'The printer has a paper jam. Please clear it and retry.',
    errorOutOfPaper: 'The printer is out of paper. Please refill it and retry.',
    errorOutOfInk: 'The printer is out of ink. Please replace it and retry.',
    errorSubmitFailed: 'Printing failed. Please retry.',
    errorConversionFailed: 'This document could not be prepared for printing.',
  },
  finalisingSession: {
    message: 'Your documents have been printed. Thank you!',
  },
  endingSession: {
    message: 'Ending session...',
  },
};

export type Translations = typeof en;
