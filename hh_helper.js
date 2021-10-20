// ==UserScript== Обновление: 20 октября 2021 - Исправлен баг в "Скачать CSV"

/*
* ОПИСАНИЕ ФУНКЦИОНАЛА
* 1. Генерация CSV с откликами на вакансии
* 2. Чекбокс - Выбрать все отклики
* 3. Резюме Walker
*     - Скачать резюме
*     - Пригласить по теме Оценка
*/

const hh_helper = function () {

    const resumeEachItemProcessTimeout = 2000;
    const skipApplicationActionTimeout = 10000;

    const HREF = window.location.href;

    if ([ // Список масок location.href дополнительных окон веб страницы, на которых не нужно отрабатывать скрипт
        /(^[^:\/#\?]*:\/\/([^#\?\/]*\.)?websocket\.hh\.ru(:[0-9]{1,5})?\/.*$)/,
    ].some(regExp => regExp.test(window.location.href))) {
        return;
    }


    /** Global functions */


    /**
     * Функция для запуска событий мыши
     * @param elem Цель
     * @param type Тип события
     * @param centerX
     * @param centerY
     */
    function eventFire(elem, type, centerX, centerY) {
        var evt = document.createEvent('MouseEvents');
        evt.initMouseEvent(
            type,
            true,
            true,
            unsafeWindow,
            1,
            1,
            1,
            centerX || 0,
            centerY || 0,
            false,
            false,
            false,
            false,
            0,
            elem
        );
        elem.dispatchEvent(evt)
    }


    /**
     * Функция слежения за изменениями в DOM (внутри target)
     * @param selector Селектор наблюдаемого элемента
     * @param target Родительский элемент
     * @param callback Функция обратного вызова
     * @param disposable Отключение слежки после первого изменения
     */
    function watchDomMutation(selector, target, callback, disposable = false) {
        const observer = new MutationObserver((mutationsList) => {
            for (let mutation of mutationsList) {
                if (mutation.type !== 'childList' || !mutation.addedNodes.length) {
                    continue;
                }
                Array.from(mutation.addedNodes).forEach(function (node) {
                    if (!(node instanceof Element)) {
                        return;
                    }
                    if (node.matches(selector)) {
                        callback(node);
                        disposable && observer.disconnect();
                        return observer;
                    }
                });
            }
        });
        observer.observe(target, {
            childList: true,
            subtree: true
        });
    }


    /**
     * Ожижидание первой мутации элемента
     * @param selector Селектор наблюдаемого элемента
     * @param target Родительский элемент
     * @param type Тип мутации
     */
    function waitDomMutation(selector, target, type = null) {
        return new Promise(function (resolve) {
            const observer = new MutationObserver((mutationsList) => {
                for (let mutation of mutationsList) {
                    if (type && mutation.type !== type) {
                        continue;
                    }
                    if (mutation.type === 'childList') {
                        if (mutation.type !== 'childList' || !mutation.addedNodes.length) {
                            continue;
                        }
                        Array.from(mutation.addedNodes).forEach(function (node) {
                            if (!(node instanceof Element)) {
                                return;
                            }
                            if (node.matches(selector)) {
                                observer.disconnect();
                                resolve(node);
                            }
                        });
                    } else if (mutation.type === 'attributes') {
                        resolve(mutation);
                    } else if (mutation.type === 'characterData') {
                        console.log('The ' + mutation.characterData + ' characterData was modified.');
                    } else {
                        console.log('The mutation type is ' + mutation.type);
                    }
                }
            });
            observer.observe(target, {
                characterData: true,
                attributes: true,
                childList: true,
                subtree: true
            });
        });
    }


    /**
     * Ожидает появление элемента в DOM
     * @param selector Селектор ожидаемого элемента
     * @param parent Родительский элемент
     * @returns {Promise<Element>}
     */
    function waitForElement(selector, parent = document) {
        return new Promise(function (resolve) {
            let interval = setInterval(function () {
                const element = parent.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 50);
        });
    }


    /**
     * Синхронная функция задержки(паузы)
     * @param ms
     * @returns {Promise<null>}
     */
    const delay = ms => {
        return new Promise(r => setTimeout(() => r(), ms))
    };


    /**
     * Return the first #text node content
     * @param node
     * @returns {*|string}
     */
    const getFirstTextNode = (node) => {
        const text = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
        return text && text.textContent.trim();
    }


    /**
     * Возвращает подстроку location.pathname
     * @param url
     * @param limit Ограничивает количество сегментов
     * @param start Начало выборки сегментов
     * @returns {string}
     */
    function getUrlPathSegments(url = '', limit = 0, start = 0) {

        let pathname = url
            ? new URL(url).pathname
            : location.pathname;

        const sectionsArray = pathname.replace(/^\/|\/$/g, '').split('/');

        let sectionsResult = [];
        for (let i = 0, count = 0; sectionsArray.length > i; i++, count++) {
            if (start > i) continue;
            if (limit && count === limit) break;
            sectionsResult.push(sectionsArray[i]);
        }

        return sectionsResult.join('/');
    }


    /**
     * Возвращает значение параметра из URL фдреса страницы
     * @param parameterName Имя параметра
     * @returns {string}
     */
    function getUrlParameterValue(parameterName) {
        return (new URL(window.location.href)).searchParams.get(parameterName);
    }


    /**
     * Форматирование даты
     * @param str
     * @returns {string}
     */
    function formatDateString(str) {
        let months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        str = str.replace(/\u00a0/g, ' ');
        for (let i = 0; i < months.length; i++) {
            if (str.includes(months[i])) {
                str = str.replace(months[i], (i + 1).toString());
                break;
            }
        }
        let datetime = str.split(', ');
        let date = datetime[0].split(' ');

        let day = parseInt(date[0]) < 10 ? '0' + date[0] : date[0];
        let month = parseInt(date[1]) < 10 ? '0' + date[1] : date[1];
        let year = (typeof date[2] === 'undefined') ? (new Date()).getFullYear() : date[2];

        return day + '/' + month + '/' + year + ' ' + datetime[1];
    }


    /**
     * Возвращает найденные в строке номера телефонов
     * @param str Строка для поиска номеров
     * @returns {*} Возвращает массив с номерами телефонов
     */
    function getPhoneNumbersFromString(str) {
        return str.match(/(\+)?(\(\d{2,3}\) ?\d|\d)(([ \-]?\d)|( ?\(\d{2,3}\) ?)){5,12}\d/g);
    }


    /**
     * Удаляет все символы из строки, кроме + и цифр
     * @param phoneNumber Строка с номер телефона
     * @returns {*}
     */
    function clearPhoneNumber(phoneNumber) {
        return phoneNumber.replace(/[^+\d]+/g, "");
    }


    /**
     * Вставляет элемент в DOM
     * @param element
     * @param parent
     * @param index
     */
    function insertElement(element, parent, index) {
        let children = parent.childNodes;
        index = typeof index === 'undefined' || !children[index] ? children.length : index;
        parent.insertBefore(element, children[index]);
    }


    /**
     * Добавляет кнопку в строку фильтров откликов
     * @param html HTML кнопки
     * @param index Порядковый номер кнопки перед которой будет вставлена новая
     * @returns Element Возвращает добавленную кнопку
     */
    function addCollectionFilterButton(html, index) {
        const wrapper = document.createElement('span');
        wrapper.setAttribute('class', 'candidates-button');
        wrapper.innerHTML = html;
        insertElement(wrapper, collectionFiltersContainer, index);

        return wrapper.firstChild;
    }


    /**
     * Добавляет кнопку в строку фильтров резюме
     * @param html HTML кнопки
     * @param index Порядковый номер кнопки перед которой будет вставлена новая
     * @returns Element Возвращает добавленную кнопку
     */
    function addResumeFilterButton(html, index) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('class', 'candidates-reject-controls');
        wrapper.innerHTML = html;
        insertElement(wrapper, applicationsFiltersContainer, index);

        return wrapper.firstChild;
    }


    /* Global vars */

    var collectionFiltersContainer;
    var applicationsFiltersContainer;


    /* Селекторы */

    const selectorContainerVacancies = 'div.HH-Employer-VacancyResponse-AjaxSubmit-ResultContainer';
    const selectorWrapperVacancies = 'div.HH-Employer-VacancyResponse-BatchActions-ItemsWrapper';
    const selectorVacancyItem = selectorWrapperVacancies + ' div.resume-search-item:not([data-counter-name=""])';
    const selectorButtonNextPage = 'a.bloko-button.HH-Pager-Control[data-qa="pager-next"]';
    const selectorButtonFirstPage = 'a.bloko-button.HH-Pager-Control[data-page="0"]';

    const selectorContainerApplications = '[data-qa="resume-serp__results-search"]';
    const selectorApplicationItem = '[data-qa="resume-serp__resume"]';
    const selectorApplicationsNavButtons = '[data-qa="pager-block"] .bloko-button-group a';
    const selectorApplicationsNavButtonPageOne = '[data-qa="pager-block"] .bloko-button-group a:first-child';
    const selectorApplicationsNavButtonFirstPage = '[data-qa="pager-block"] [data-qa="first-page"]';
    const selectorApplicationsNavButtonNextPage = '[data-qa="pager-block"] [data-qa="pager-next"]';


    /* Открыта страница откликов */
    if (getUrlPathSegments() === 'employer/vacancyresponses' && [
        'consider',
        'phone_interview',
        'assessment',
        'interview',
        'offer',
        'hired',
        'discard_by_employer'
    ].includes(getUrlParameterValue('collection'))) {

        /* Добавление кнопок "Выбрать все" и "Скачать CSV" */
        waitForElement('[data-qa="lux-container lux-container-rendered"] > div',
            document.querySelector('div.vacancy-responses-filters')).then(container => {

                collectionFiltersContainer = container;

                // Добавление кнопки "Скачать CSV"
                addCollectionFilterButton('<button class="bloko-button">Скачать CSV</button>', 2)
                    .addEventListener('click', function (e) {
                        e.preventDefault();
                        actionGrabVacancies();
                    });

                // Добавление кнопки "Выбрать все"
                addCollectionFilterButton('<input type="checkbox" title="Выбрать все" style="margin-right:5px">', 0)
                    .addEventListener('click', function (e) {
                        actionSelectAllVacancies(e.target);
                    });

            }
        );

    }

    /* Открыта страница "Все неразобранные" отклики */
    if (getUrlPathSegments() === 'employer/vacancyresponses'
        && 'response' === getUrlParameterValue('collection')) {

        collectionFiltersContainer = document.querySelector('div.vacancy-responses-controls.HH-Employer-VacancyResponse-Controls');

        // Добавление кнопки "Скачать CSV"
        addCollectionFilterButton('<button class="bloko-button">Скачать CSV</button>', 2)
            .addEventListener('click', function (e) {
                e.preventDefault();
                actionGrabVacancies();
            });

    }


    /**
     * --------------------------------------------------------------------------------------------------------------
     * 1. Генерация CSV с откликами на вакансии
     * --------------------------------------------------------------------------------------------------------------
     */

    async function actionGrabVacancies() {
        let tempArrayVacancies = [];
        let containerVacancies = await waitForElement(selectorContainerVacancies);
        // Если не первая страница
        let buttonFirstPage = document.querySelector(selectorButtonFirstPage);
        if (buttonFirstPage) {
            eventFire(buttonFirstPage, 'click');
            await waitForElement(selectorContainerVacancies + ' div[data-qa="pager-block"]');
        }

        // Парсинг текущей страницы
        tempArrayVacancies = tempArrayVacancies.concat(await grubVacanciesPage(containerVacancies));

        // Если есть следующая страница
        let buttonNext = document.querySelector(selectorButtonNextPage);
        while (buttonNext) {
            eventFire(buttonNext, 'click');
            // Парсинг текущей страницы
            await waitForElement(selectorContainerVacancies + ' div[data-qa="pager-block"]');
            tempArrayVacancies = tempArrayVacancies.concat(await grubVacanciesPage(containerVacancies));
            await delay(50);
            buttonNext = document.querySelector(selectorButtonNextPage);
        }

        console.warn('ГОТОВО. Обработано: ' + tempArrayVacancies.length + ' вакансий');

        // До конца функции - генерация CSV
        let csv = '';
        let delimiter = ';';
        for (let row = 0; row < tempArrayVacancies.length; row++) {
            let keysAmount = Object.keys(tempArrayVacancies[row]).length
            let keysCounter = 0
            if (row === 0) {
                for (let key in tempArrayVacancies[row]) {
                    csv += '"' + key + (keysCounter + 1 < keysAmount ? ('"' + delimiter) : '"\r\n')
                    keysCounter++
                }
            }
            keysCounter = 0
            for (let key in tempArrayVacancies[row]) {
                csv += '"' + tempArrayVacancies[row][key].replace(/["«»]/g, '').replace(delimiter, '') + (keysCounter + 1 < keysAmount ? ('"' + delimiter) : '"\r\n')
                keysCounter++
            }
            keysCounter = 0
        }
        let link = document.createElement('a')
        link.id = 'download-csv'
        link.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(csv));

        let currentdate = new Date();
        let filename = 'export_vacancies_' + currentdate.getDate() + '-'
            + (currentdate.getMonth() + 1) + '-'
            + currentdate.getFullYear() + '_'
            + currentdate.getHours() + '-'
            + currentdate.getMinutes() + '-'
            + currentdate.getSeconds() + '.csv';
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        document.querySelector('#download-csv').click();
    }

    function grubVacanciesPage(wrapper) {

        return new Promise(async resolve => {
            let items = wrapper.querySelectorAll(selectorVacancyItem);
            let result = [];
            for (var item of items) {
                result.push(await grabVacancyItem(item));
            }
            resolve(result);
        });
    }

    async function grabVacancyItem(item) {
        let age = item.querySelector('span[data-qa="resume-serp__resume-age"]').textContent;
        let fullname = item.querySelector('.resume-search-item__fullname').textContent.split(',')[0].replace(age, '');
        let lastPosition = '';
        let lastCompany = '';
        let period = '';
        let lastPositionElement = item.querySelector('.resume-search-item__description-content[data-qa="resume-serp_resume-item-content"] div[data-hh-last-experience-id]');
        if (lastPositionElement) {
            lastPosition = lastPositionElement.querySelector('.bloko-link-switch').textContent;
            let parentContainer = lastPositionElement.closest('.resume-search-item__description-content');
            lastCompany = (parentContainer.querySelector('.bloko-text-emphasis') || parentContainer.querySelector('span.resume-hidden-field_search')).textContent;
            period = parentContainer.lastElementChild.textContent;
        }
        let phones = item.querySelectorAll('div[data-qa="resume-contacts-phone"]');
        let phonesStr = '';
        if (phones.length) {
            phones.forEach((phone) => {
                let showPhoneNumberButton = phone.querySelector('button[data-qa="response-resume_show-phone-number"]')
                if (showPhoneNumberButton) {
                    eventFire(showPhoneNumberButton, 'click');
                }
                phonesStr += getPhoneNumbersFromString(phone.textContent).join(', ') + ', ';
            });
            phonesStr = phonesStr.slice(0, -2);
        }

        let outputAddition = item.querySelector('div.output__addition[data-qa="resume-serp__resume-additional"]');
        let dates = outputAddition.querySelectorAll('div.resume-search-item__description-title');
        let updatedDate = formatDateString(dates[0].innerText.replace('Обновлено ', ''));
        let respondedDate = formatDateString(getFirstTextNode(dates[1].childNodes[0]).replace('Откликнулся ', ''));

        let d = new Date(JSON.parse(
            outputAddition.querySelector('[data-name="HH/LastActivityTime"]').dataset.params
        ).lastActivityTime);
        let lastActivityDate = formatDateString(d.getDate() + ' ' + (d.getMonth() + 1) + ' ' + d.getFullYear() + ', ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2));

        const compensationEl = item.querySelector('.resume-search-item__compensation')
            || item.querySelector('.resume-search-item__header > .bloko-text');

        return {
            'vacancy_name': item.querySelector('.resume-search-item__name').textContent,
            'vacancy_link': item.querySelector('.resume-search-item__name').href,
            'fullname': fullname,
            'age': age,
            'compensation': compensationEl.textContent,
            'last_position': lastPosition,
            'last_company': lastCompany,
            'period': period,
            'phone': phonesStr,
            'updated_date': updatedDate,
            'responded_date': respondedDate,
            'last_activity': lastActivityDate,
        };
    }


    /**
     * --------------------------------------------------------------------------------------------------------------
     * 2. Чекбокс - Выбрать все отклики
     * --------------------------------------------------------------------------------------------------------------
     */

    function actionSelectAllVacancies(checkbox) {
        let items = document.querySelectorAll(selectorContainerVacancies + ' ' + selectorVacancyItem);
        for (var item of items) {
            if (checkbox.checked && !item.classList.contains('resume-search-item_checked') || !checkbox.checked && item.classList.contains('resume-search-item_checked')) {
                eventFire(item.querySelector('.bloko-checkbox'), 'click');
            }
        }
    }


    /**
     * --------------------------------------------------------------------------------------------------------------
     * 3. Walker по страницам с резюме
     * --------------------------------------------------------------------------------------------------------------
     */

    /* Открыта страница поиска подходящих резюме */
    if (getUrlPathSegments() === 'search/resume') {

        if (getUrlParameterValue('helper_action') === 'download') {
            // Если идет процесс скачки файлов

            applicationsPageWalker();
        } else if (getUrlParameterValue('helper_action') === 'invite') {
            // Если идет процесс рассылки приглашений

            applicationsPageWalker();
        } else {
            // Если страница открыта обычным способом

            /* Добавление кнопок "Скачать резюме" и "Пригласить" */
            waitDomMutation('div', document.querySelector('#HH-React-Root .bloko-form-item', 'attributes'))
                .then(() => {
                    applicationsFiltersContainer = document.querySelector('#HH-React-Root .resume-serp-filters');

                    addResumeFilterButton('<button class="bloko-button">Скачать резюме</button>', 4)
                        .addEventListener('click', function (e) {

                            if (GM.getValue || confirm("Внимание! Локальное хранилище не включено. Продолжить работу?")) {
                                // Если включено локальное хранилище или проигнорировано пользователем
                                applicationsPageWalker('download');
                            }
                        });

                    addResumeFilterButton('<button class="bloko-button">Пригласить</button>', 5)
                        .addEventListener('click', function (e) {
                            applicationsPageWalker('invite');
                        });
                });
        }


        /**
         * Функция перехода по страницам поиска подходящих резюме
         * @param action Текущее действие на странице
         * @returns {Promise<void>}
         */
        async function applicationsPageWalker(action = '') {
            const currentPage = parseInt(getUrlParameterValue('page')) || 0;

            if (action || getUrlParameterValue('helper_action')) {

                if (action && currentPage !== 0) {
                    // Если не первая страница и процесс парсинга еще не начат - перехожу к первой странице

                    const buttonFirstPage = document.querySelector(selectorApplicationsNavButtonFirstPage) || document.querySelector(selectorApplicationsNavButtonPageOne);
                    location.href = buttonFirstPage.href + '&helper_action=' + action;

                } else {
                    // Начинаю или родолжаю парсить

                    await delay(1000);

                    action = action || getUrlParameterValue('helper_action');
                    // Парсинг текущей страницы
                    const applications = document.querySelectorAll(selectorContainerApplications + ' ' + selectorApplicationItem);

                    await processApplications(applications, action, resumeEachItemProcessTimeout);

                    const buttonNextPage = document.querySelector(selectorApplicationsNavButtonNextPage);
                    if (buttonNextPage) {
                        // Если есть следующая страница - перехожу на нее

                        if (!getUrlParameterValue('helper_action')) {
                            location.href = buttonNextPage.href + '&helper_action=' + action;
                        } else {
                            eventFire(buttonNextPage, 'click');
                        }

                    } else {
                        // Завершаю работу

                        history.pushState({}, null, location.href.replace('&helper_action=' + action, ''));
                        document.querySelectorAll(selectorApplicationsNavButtons).forEach(function (button) {
                            button.href = button.href.replace('&helper_action=' + action, '')
                        });
                        console.warn('ГОТОВО. Обработано: ' + (currentPage + 1) + ' страниц');

                    }

                }
            }
        }


        /**
         * Обработка каждого резюме на страницах поиска подходящих резюме
         * @param applications Список резюме на странице
         * @param action Текущее действие
         * @param timeout Пауза после обработкт каждого резюме
         * @returns {Promise<void>}
         */
        async function processApplications(applications, action, timeout) {
            for (const item of applications) {

                const application_url = item.querySelector('[data-qa="resume-serp__resume-title"]').href;
                const application_hash = getUrlPathSegments(application_url, 0, 1);

                try {
                    let result;
                    switch (action) {

                        case "download":

                            if (GM.getValue && await GM.getValue(application_hash)) {
                                // Если ID резюме сохранен в хранилищи - значит был скачан прежде
                                continue;
                            } else if (!GM.getValue) {

                            }

                            result = await processChildWindowAction(action, application_url);
                            // Сохранение информации о скачаном файле резюме в хранилице tampermonkey
                            GM.getValue && await GM.setValue(application_hash, '1');
                            break;

                        case "invite":
                            if (item.querySelector('[data-qa="topic-state"]')) {
                                // Приглашение уже отправлнео
                                continue;
                            }

                            result = await processChildWindowAction(action,
                                item.querySelector('[data-qa="employee-invite-on-topic"]').href);
                            break;

                    }
                    if (result) {
                        console.log('Успешнно: "' + result.message + '". ID резюме: ' + application_hash);
                    }
                } catch (result) {
                    console.error('Неудача: "' + result.message + '". ID резюме: ' + application_hash)
                }

                await delay(timeout);
            }
        }


        /**
         * Открывает соответсвующую действию дочернию страницу, и посылает ей запрос на действие
         * @param action Действие
         * @param url Адрес страницы
         * @returns {Promise}
         */
        function processChildWindowAction(action, url) {

            return new Promise(async (resolve, reject) => {

                const childWindow = window.open(url + '&helper_action=' + action);

                unsafeWindow.actionCloseChild = (result) => {

                    clearTimeout(window.actionTimeout);
                    childWindow.close();

                    if (result.status === 'ok') {
                        resolve(result);
                    } else {
                        reject(result);
                    }

                }

                window.actionTimeout = setTimeout(() => {

                    childWindow.close();
                    reject({
                        status: 'error',
                        message: 'Сброс по таймеру. Ссылка на резюме: ' + url
                    });
                }, skipApplicationActionTimeout);

            })
        }
    }

    /**
     * --------------------------------------------------------------------------------------------------------------
     * 3. - Скачать резюме
     * --------------------------------------------------------------------------------------------------------------
     */


    /* Открыта страница резюме */

    if (getUrlPathSegments(null, 1) === 'resume') {

        const action = getUrlParameterValue('helper_action');

        if (action === 'download') {

            downloadResume().then(function (result) {
                // Если успешно

                // Запрос к родительскому окну на закрытие окна резюме через 1 секунду
                setTimeout(function () {
                    window.opener.actionCloseChild(result);
                }, 1000);
            }).catch(function (result) {
                // Если неудача

                // Запрос к родительскому окну на закрытие окна резюме
                window.opener.actionCloseChild(result);
            });

        }

        async function downloadResume() {
            return new Promise(async (resolve, reject) => {

                // Получение ID резюме
                const resume_hash = getUrlPathSegments(null, 0, 1);

                // Получение имени
                const personalNameElement = await waitForElement('[data-qa="resume-personal-name"]');
                if (!personalNameElement) {
                    reject({
                        status: 'error',
                        message: 'Имя соискателя не найдено или скрыто.',
                        id: resume_hash
                    });
                    return;
                }
                let personalName = personalNameElement.textContent;

                // Получение номера телефона
                const contactsBlock = await waitForElement('[data-qa="resume-block-contacts"]');
                let phoneNumber = await getResumePhoneNumber(contactsBlock);

                // Если номер телефона скрыт
                if (!phoneNumber) {
                    reject({
                        status: 'error',
                        message: 'Номер телефона не найден или скрыт.',
                        id: resume_hash
                    });
                    return;
                }

                // Форматирование номера телефона
                phoneNumber = phoneNumber.replace('+', '');
                // Формирование имени файла документа резюме
                const fileName = phoneNumber + ' ' + personalName + '.doc';
                // Формирование ссылки на файл документа резюме и последующий переход по ней
                location.href = window.location.protocol + '//' + window.location.hostname +
                    '/resume_converter/' +
                    encodeURI(fileName) +
                    '?hash=' + resume_hash +
                    '&simhash=' + getUrlParameterValue('simhash') +
                    '&vacancyId=' + getUrlParameterValue('vacancyId') +
                    '&type=rtf&hhtmSource=resume&hhtmFrom=resume_search_result';

                resolve({
                    status: 'ok',
                    message: 'Документ "' + fileName + '" скачан.',
                    hash: resume_hash
                });
            });
        }

        async function getResumePhoneNumber(source) {

            let showPhoneNumberButton = source.querySelector('[data-qa="response-resume_show-phone-number"]');

            if (showPhoneNumberButton) { // Номер телефона скрыт
                setTimeout(() => {
                    eventFire(showPhoneNumberButton, 'click');
                }, 500);
                source = await waitDomMutation('[data-qa="resume-serp_resume-item-content"]', source);
            }

            let numbers = getPhoneNumbersFromString(source.textContent);

            return numbers && numbers.length
                ? clearPhoneNumber(numbers[0])
                : null;
        }
    }


    /**
     * --------------------------------------------------------------------------------------------------------------
     * 3. - Пригласить по теме Оценка
     * --------------------------------------------------------------------------------------------------------------
     */


    /* Открыта страница приглашения */

    if (getUrlPathSegments() === 'employer/negotiations/change_topic') {

        const action = getUrlParameterValue('helper_action');

        if (action === 'invite') {

            inviteOnAssessment().then(function (result) {
                // Если успешно

                // Запрос к родительскому окну на закрытие окна
                window.opener.actionCloseChild(result);
            }).catch(function (result) {
                // Если неудача

                // Запрос к родительскому окну на закрытие окна резюме
                window.opener.actionCloseChild(result);
            });
        }

        async function inviteOnAssessment() {
            return new Promise(async (resolve, reject) => {
                const inviteStatesSelect = document.querySelector('[data-qa="negotiations-change-topic__states"]');
                const inviteSubmitButton = document.querySelector('[data-qa="negotiations-change-topic__submit"]');

                await delay(500);

                inviteStatesSelect.value = 'assessment';
                eventFire(inviteStatesSelect, 'change');

                setTimeout(() => {
                    eventFire(inviteSubmitButton, 'click');
                }, 500);

                window.addEventListener("unload", function () {
                    resolve(
                        {
                            status: 'ok',
                            message: 'Приглашение отправлено'
                        }
                    );
                });
            });
        }

    }

};
