/*
* ОПИСАНИЕ ФУНКЦИОНАЛА
* 1. Генерация CSV с откликами на вакансии
*
*
*
*/

const hh_helper = function () {

    // function for triggering mouse events
    function eventFire(elem, type, centerX, centerY) {
        var evt = document.createEvent('MouseEvents')
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
        )
        elem.dispatchEvent(evt)
    }

    // Функция слежения за изменениями в DOM (внутри target)
    function watchDomMutation(selector, target, callback) {
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

    // Синхронная функция задержки
    const delay = ms => {
        return new Promise(r => setTimeout(() => r(), ms))
    }

    /**
     * --------------------------------------------------------------------------------------------------------------
     * 1. Генерация CSV с откликами на вакансии
     * --------------------------------------------------------------------------------------------------------------
     */

    const selectorContainerVacancies = 'div.HH-Employer-VacancyResponse-AjaxSubmit-ResultContainer';
    const selectorWrapperVacancies = 'div.HH-Employer-VacancyResponse-BatchActions-ItemsWrapper';
    const selectorVacancyItem = selectorWrapperVacancies + ' div.resume-search-item';
    const selectorButtonNextPage = 'a.bloko-button.HH-Pager-Control[data-qa="pager-next"]';
    const selectorButtonFirstPage = 'a.bloko-button.HH-Pager-Control[data-page="0"]';

    function addButton() {
        const button = $('<span class="candidates-button">' +
            '<button type="submit" name="reject" class="bloko-button" id="grabVacancies" >Скачать CSV</button>' +
            '</span>')
        document.querySelector('div.vacancy-responses-controls.HH-Employer-VacancyResponse-Controls').insertBefore(button[0], document.querySelector('div.vacancy-responses-configure'));
        button.click(function () {
            actionGrabVacancies();
            return false;
        });
    }

    addButton();

    async function actionGrabVacancies() {
        let tempArrayVacancies = [];
        let containerVacancies = await waitForElement(selectorContainerVacancies);

        // Если не первая страница
        let buttonFirstPage = document.querySelector(selectorButtonFirstPage);
        if (buttonFirstPage) {
            eventFire(buttonFirstPage, 'click');
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
            buttonNext = document.querySelector(selectorButtonNextPage);
        }

        console.warn('ГОТОВО. Обработано: ' + tempArrayVacancies.length + ' вакансий');

        // До конца функции - CSV
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
        let phones = item.querySelectorAll('div[data-qa="resume-contacts-phone"] > span:first-child');
        let phoneText = '';
        if (phones.length) {
            phones.forEach((phone) => {
                phoneText += phone.textContent + ', '
            });
            phoneText = phoneText.slice(0, -2);
        }

        let outputAddition = item.querySelector('div.output__addition[data-qa="resume-serp__resume-additional"]');
        let dates = outputAddition.querySelectorAll('div.resume-search-item__description-title');
        let updatedDate = formatDateString(dates[0].innerText.replace('Обновлено ', ''));
        let respondedDate = formatDateString(dates[1].childNodes[0].nodeValue.replace('Откликнулся ', ''));

        let d = new Date(JSON.parse(
            outputAddition.querySelector('[data-name="HH/LastActivityTime"]').dataset.params
        ).lastActivityTime);
        let lastActivityDate = formatDateString(d.getDate() + ' ' + (d.getMonth() + 1) + ' ' + d.getFullYear() + ', ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2));

        return {
            'vacancy_name': item.querySelector('.resume-search-item__name').textContent,
            'vacancy_link': item.querySelector('.resume-search-item__name').href,
            'fullname': fullname,
            'age': age,
            'compensation': item.querySelector('.resume-search-item__compensation').textContent,
            'last_position': lastPosition,
            'last_company': lastCompany,
            'period': period,
            'phone': phoneText,
            'updated_date': updatedDate,
            'responded_date': respondedDate,
            'last_activity': lastActivityDate,
        };
    }

};