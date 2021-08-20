// ==UserScript== Core Helper: 17 августа 2021 - Initial commit

/*
* ФАЙЛ С ГЛОБАЛЬНЫМИ ФУНКЦИЯМИ
*/


/**
 * Функция для запуска событий мыши
 * @param {Node} elem Цель
 * @param {string} type Тип события
 * @param {int} centerX
 * @param {int} centerY
 */
function eventFire(elem, type, centerX, centerY) {
    var evt = document.createEvent('MouseEvents');
    evt.initMouseEvent(
        type,
        true,
        true,
        window,
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
 * @param {string} selector Селектор наблюдаемого элемента
 * @param {Node} target Родительский элемент
 * @param {string} callback Функция обратного вызова
 * @param {boolean} disposable Отключение слежки после первого изменения
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
 Ожижидание первой мутации элемента
 * @param {string} selector Селектор наблюдаемого элемента
 * @param {Node} target Родительский элемент
 * @param {string} type Тип мутации
 * @returns Promise<unknown>
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
                    DEBUG_MODE && console.log('The ' + mutation.characterData + ' characterData was modified.');
                } else {
                    DEBUG_MODE && console.log('The mutation type is ' + mutation.type);
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
 * @param {string} selector Селектор ожидаемого элемента
 * @param {Node} parent Родительский элемент
 * @returns Promise<Element>
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
 * @param {int} ms
 * @returns Promise<null>
 */
function delay(ms) {
    return new Promise(r => setTimeout(() => r(), ms))
}


/**
 * Возвращает подстроку location.pathname
 * @param {string} url
 * @param {int} limit Ограничивает количество сегментов
 * @param {int} start Начало выборки сегментов
 * @returns string
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
 * @param {string} parameterName Имя параметра
 * @returns string
 */
function getUrlParameterValue(parameterName) {
    return (new URL(window.location.href)).searchParams.get(parameterName);
}


/**
 * Форматирование даты
 * @param {string} str
 * @returns string
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
 * @param {string} str Строка для поиска номеров
 * @returns Array Возвращает массив с номерами телефонов
 */
function getPhoneNumbersFromString(str) {
    return str.match(/(\+)?(\(\d{2,3}\) ?\d|\d)(([ \-]?\d)|( ?\(\d{2,3}\) ?)){5,12}\d/g);
}


/**
 * Удаляет все символы из строки, кроме + и цифр
 * @param {string} phoneNumber Строка с номер телефона
 * @returns string
 */
function clearPhoneNumber(phoneNumber) {
    return phoneNumber.replace(/[^+\d]+/g, "");
}


/**
 * Вставляет элемент в DOM
 * @param {Node} element
 * @param {Node} parent
 * @param {int} index
 */
function insertElement(element, parent, index) {
    let children = parent.childNodes;
    index = typeof index === 'undefined' || !children[index] ? children.length : index;
    parent.insertBefore(element, children[index]);
}


/**
 * Вставляет HTML в DOM
 * @param {string} html
 * @param {Node} parent
 * @param {int} index
 * @returns Node
 */
function insertHtml(html, parent, index) {
    const tpl = document.createElement('div');
    tpl.innerHTML = html;
    const element = tpl.firstElementChild;
    insertElement(element, parent, index);

    return element;
}
