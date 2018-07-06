document.addEventListener('DOMContentLoaded', async function () {

  window.STORAGE_KEY = 'myRabbitPayloads';
  let payloads = [];

  //---------------------------------------------------------------------
  //      LOCAL STORAGE
  //---------------------------------------------------------------------

  const getPayloadsFromStorage = () => (
    new Promise((resolve, reject) => {
      chrome.storage.sync.get(window.STORAGE_KEY, function (result) {
        if (result.myRabbitPayloads && result.myRabbitPayloads.length) {
          resolve(result.myRabbitPayloads);
        } else {
          resolve([]);
        }
      });
    })
  );

  const savePayloadsToStorage = (payloads) => (
    new Promise((resolve, reject) => {
      chrome.storage.sync.set({
        [window.STORAGE_KEY]: payloads
      }, resolve);
    })
  );

  //---------------------------------------------------------------------
  //      INTERACTION WITH USER TAB
  //---------------------------------------------------------------------

  const getRoutingKey = () => (
    new Promise((resolve, reject) => {
      chrome.tabs.executeScript(null, {
        code: 'document.querySelectorAll(\'input[name="routing_key"]\')[1].value;'
      }, (result) => {
        resolve(result[0]);
      })
    }));

  const getHeaders = () => (
    new Promise((resolve, reject) => {
      chrome.tabs.executeScript(null, {
        code: 'Array.from(document.querySelectorAll(\'[id^="headers_"]\')).map((x)=> x.value);'
      }, (result) => {
        result = result[0]
        const headers = []
        for (var i = 0; i < result.length; i++) {
          if (((i + 1) % 3) === 0) {
            headers.push({
              key: result[i - 2],
              value: result[i - 1],
              type: result[i]
            })
          }
        }
        const last = headers[headers.length - 1];
        if (last.key === "" && last.value === "") {
          headers.pop(-1)
        }
        resolve(headers);
      })
    })
  );

  const getPayloadText = () => (
    new Promise((resolve, reject) => {
      chrome.tabs.executeScript(null, {
        code: "document.getElementsByTagName('textarea')[0].value;"
      }, (result) => {
        resolve(result[0]);
      })
    })
  );

  const applyPayloadOnUserTab = (payload) => {
    let code = `
    document.querySelectorAll(\'input[name="routing_key"]\')[1].value = "${payload.routingKey}";
    document.getElementsByTagName('textarea')[0].value = "${payload.text}";
    var evt,elems;
    `;

    if(payload.headers){
      payload.headers.forEach((header,idx)=>{
        code += `
        elems = document.querySelectorAll(\'[id^="headers_"]\');
        elems[${idx*3}].value = "${header.key}"
        elems[${idx*3+1}].value = "${header.value}"
        elems[${idx*3+2}].value = "${header.type}"
        evt = document.createEvent("Events");
        evt.initEvent("keyup", true, true);
        elems[${idx*3+1}].dispatchEvent(evt);
        `;
      });
    };

    return new Promise((resolve, reject) => {
      chrome.tabs.executeScript(null, {
        code: code
      }, (result) => {
        resolve(result[0]);
      })
    })
  };


  //---------------------------------------------------------------------
  //      EXTENSION WIDGET DOM MANIPULATION
  //---------------------------------------------------------------------

  const saveNewPayload = async (payloads, payload) => {
    payloads.push(payload);
    await savePayloadsToStorage(payloads);
    updatePayloadsDOM(payloads);
  };

  const deletePayload = (payloads, idx) => {
    payloads.splice(idx, 1);
    savePayloadsToStorage(payloads);
    updatePayloadsDOM(payloads);
  };

  const selectPayload = (payloads, idx) => {
    payloads.map((p, idx) => document.getElementById(`select-payload-${idx}`).classList.remove('selected'));
    document.getElementById(`select-payload-${idx}`).classList.add('selected');
  };

  const updatePayloadsDOM = (payloads) => {

    const payloadElements = payloads.map((payload, idx) => {
      let element = document.createElement('div');
      element.id = 'payload-elem' + idx;
      element.innerHTML = `
      <span id="select-payload-${idx}" class="wrapper flex payload-elem-wrapper">      
        <span class="payload-name" >
          ${payload.name}
        </span>
        
        <span id="delete-payload-${idx}">
          <svg style="width:24px;height:24px" viewBox="0 0 24 24">
              <path fill="#000000" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
          </svg>
        </span>
      </span>
      `;

      return element;
    });

    const payloadList = document.getElementById('payload-list');
    payloadList.innerHTML = '';
    payloadElements.forEach((payloadElem) => {
      payloadList.appendChild(payloadElem);
    });

    payloads.map((p, idx) => {
      document.getElementById(`select-payload-${idx}`).addEventListener('click', () => selectPayload(payloads, idx));
      document.getElementById(`delete-payload-${idx}`).addEventListener('click', () => deletePayload(payloads, idx));
    })

  };


  //---------------------------------------------------------------------
  //      EVENT HANDLERS
  //---------------------------------------------------------------------


  const handleSavePayloadBtnClick = async () => {
    const name = document.getElementById('save-payload-input').value;
    const routingKey = await getRoutingKey();
    const headers = await getHeaders();
    const text = await getPayloadText();

    const newPayload = {
      name: name,
      headers: headers,
      routingKey: routingKey,
      text: text
    }

    saveNewPayload(payloads, newPayload);
  };

  const handleLoadPayloadBtnClick = async () => {
    const selectedElem = document.querySelector('.selected');
    if(!selectedElem){
      return;
    }
    const idx = Number(selectedElem.id.split('-').pop(-1));

    const payloads = await getPayloadsFromStorage();
    await applyPayloadOnUserTab(payloads[idx]);
  };
  
  const hideImportExportShowContent = () => {
    document.getElementById('content').setAttribute('hidden','true');
    document.getElementById('import-export-payloads').removeAttribute('hidden');
  };

  const hideContentShowImportExport = () => {
    document.getElementById('import-export-payloads').setAttribute('hidden','true');
    document.getElementById('content').removeAttribute('hidden');
  };

  const handleToggleImportExportBtnClick = async () => {
    const payloads = await getPayloadsFromStorage();
    document.getElementById('import-export-payloads-input').value = JSON.stringify(payloads, null, 2);
    hideImportExportShowContent();
  };

  const handleImportExportCancelBtnClick = () => hideContentShowImportExport();

  const handleImportExportSaveBtnClick = async () => {
    const payloads = JSON.parse(document.getElementById('import-export-payloads-input').value);
    savePayloadsToStorage(payloads);
    updatePayloadsDOM(payloads);
    hideContentShowImportExport();
  };

  //---------------------------------------------------------------------

  
  // STARTS HERE

  payloads = await getPayloadsFromStorage();
  updatePayloadsDOM(payloads);

  document.getElementById('save-payload-btn').addEventListener('click', handleSavePayloadBtnClick);
  document.getElementById('load-payload-btn').addEventListener('click', handleLoadPayloadBtnClick);
  document.getElementById('toggle-import-export-btn').addEventListener('click', handleToggleImportExportBtnClick);
  document.getElementById('import-export-payloads-cancel-btn').addEventListener('click', handleImportExportCancelBtnClick);
  document.getElementById('import-export-payloads-save-btn').addEventListener('click', handleImportExportSaveBtnClick);
});