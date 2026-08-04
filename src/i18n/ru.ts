import type { Translations } from './en';

// Russian — see docs/i18n-requirements.md ("Translation quality": AI-generated,
// not yet reviewed by a native speaker).
export const ru: Translations = {
  common: {
    back: 'Назад',
    home: 'На главную',
    close: 'Закрыть',
    confirm: 'Подтвердить',
    paperSizeA4: 'A4',
    paperSizeA5: 'A5',
    sidesSingle: 'Односторонняя',
    sidesDouble: 'Двусторонняя',
    colorBw: 'Чёрно-белая',
    colorColor: 'Цветная',
    comingSoon: 'Скоро',
    unavailable: 'Недоступно',
    tapToConfigurePrinting: 'Нажмите, чтобы настроить печать',
    scanningForViruses: 'Проверка на вирусы...',
    configureAllFiles: 'Настроить печать для всех файлов',
    blockedVirusScan: 'Заблокировано — не прошло проверку на вирусы',
  },
  footer: {
    callOperator: 'Вызвать оператора',
    help: 'Помощь',
    tariffs: 'Тарифы',
    account: 'Аккаунт',
    cart: 'Корзина',
    language: 'Язык',
  },
  kioskLayout: {
    endSession: 'Завершить и очистить данные',
    endSessionConfirmMessage: 'Завершить эту сессию и удалить все ваши данные?',
    connectionLostTitle: 'Соединение потеряно',
    connectionLostMessage:
      'Киоск потерял соединение. Оплата и печать недоступны, пока связь не восстановится.',
    idleWarningTitle: 'Вы ещё здесь?',
    idleWarningMessage:
      'Эта сессия завершится через 1 минуту из-за бездействия. Коснитесь экрана, чтобы продолжить.',
    paidOrdersPromptMessage: 'У вас есть заказ, оплаченный заранее и ожидающий печати.',
    goToMyOrders: 'Перейти в Мои заказы',
    selectLanguage: 'Выберите язык',
  },
  cart: {
    empty: 'Корзина пуста',
    title: 'Корзина',
    qty: (quantity: number) => `Кол-во: ${quantity}`,
    total: (amount: string) => `Итого: $${amount}`,
    proceedToPayment: 'Перейти к оплате',
  },
  login: {
    checkYourEmail: 'Проверьте почту',
    resetInstructionsSent:
      'Если аккаунт с таким именем пользователя существует, на него отправлены инструкции по восстановлению пароля.',
    backToLogin: 'Назад ко входу',
    resetPassword: 'Восстановить пароль',
    username: 'Имя пользователя',
    password: 'Пароль',
    sendResetInstructions: 'Отправить инструкции',
    logIn: 'Войти',
    incorrectCredentials: 'Неверное имя пользователя или пароль.',
    forgotPassword: 'Забыли пароль?',
  },
  welcome: {
    print: 'Печать',
    scan: 'Сканирование',
    copy: 'Копирование',
    serviceUnavailableTitle: 'Услуга недоступна',
    serviceUnavailableMessage:
      'Печать временно недоступна. Попробуйте позже или обратитесь к оператору.',
  },
  uploadMethodSelection: {
    instruction: 'Выберите способ загрузки документа для печати',
    qrTitle: 'QR-код',
    qrDescription: 'Используйте телефон',
    emailTitle: 'Email',
    emailDescription: 'Отправьте файл',
    accountTitle: 'Личный кабинет',
    accountDescription: 'Ваши сохранённые файлы',
    telegramTitle: 'Telegram',
    telegramDescription: 'Через бота',
    webTitle: 'Веб-страница',
    webDescription: 'Открыть онлайн',
    usbTitle: 'USB-накопитель',
    usbDescription: 'Подключите накопитель',
  },
  emailAddress: {
    instruction: 'Отправьте документ вложением на указанный ниже адрес электронной почты',
    acceptedFormats: 'Допустимые форматы: PDF, DOC, DOCX, JPG, PNG',
    next: 'Далее',
  },
  emailFileList: {
    instruction: 'Выберите письмо, чтобы увидеть вложения',
    attachmentCount: (count: number) => `Вложений: ${count}`,
  },
  qrUpload: {
    qrImageAlt: 'QR-код для загрузки файлов с телефона',
    preparingQrCode: 'Подготовка QR-кода...',
    qrHint: 'Отсканируйте камерой телефона, затем загрузите файл(ы) со страницы, которая откроется',
    waitingForFiles: 'Ожидание файлов...',
  },
  personalAccount: {
    myFiles: 'Мои файлы',
    myOrders: 'Мои заказы',
    logOut: 'Выйти',
    backToMyFiles: 'Назад к Моим файлам',
    configureSelected: 'Настроить печать для выбранных файлов',
    noOrdersAwaitingPrint: 'Нет заказов, ожидающих печати.',
    orderDescription: (quantity: number) =>
      `Кол-во ${quantity} · Оплачено — нажмите, чтобы добавить в корзину`,
  },
  printOrderConfiguration: {
    paperSizeLegend: 'Формат бумаги',
    sidesLegend: 'Стороны',
    colorLegend: 'Цвет',
    quantity: 'Количество',
    price: (amount: string) => `Цена: $${amount}`,
    addToCart: 'Добавить в корзину',
  },
  paymentStatus: {
    cancelPayment: 'Отменить оплату',
    cancelConfirmMessage: 'Вы уверены, что хотите отменить этот заказ?',
  },
  printStatus: {
    printingMessage: 'Печать документа(ов)...',
  },
  finalisingSession: {
    message: 'Ваши документы напечатаны. Спасибо!',
  },
  endingSession: {
    message: 'Завершение сессии...',
  },
};
