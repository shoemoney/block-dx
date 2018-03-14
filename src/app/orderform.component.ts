import { Component, Input, ViewChild, OnInit, NgZone } from '@angular/core';
import * as math from 'mathjs';

import { AppService } from './app.service';
import { Currentprice } from './currentprice';
import { CurrentpriceService } from './currentprice.service';
import { OrderbookService } from './orderbook.service';
import { TabViewComponent } from './tab-view/tab-view.component';
import { SelectComponent } from './select/select.component';
import {NumberFormatPipe} from './pipes/decimal.pipe';

math.config({
  number: 'BigNumber',
  precision: 64
});

@Component({
  selector: 'app-orderform',
  templateUrl: './orderform.component.html',
  styleUrls: ['./orderform.component.scss']
})
export class OrderformComponent implements OnInit {
  @ViewChild('tabView') public tabView: TabViewComponent;
  @ViewChild('typeSelect') public typeSelect: SelectComponent;

  public symbols:string[] = [];
  public currentPrice: Currentprice;
  public totalPrice = 0;
  public orderTypes: any[];
  public selectedOrderType: any;
  public model: any;
  public addresses: {};

  public amountPopperText: string;
  public amountPopperShow = false;

  public totalPopperText: string;
  public totalPopperShow = false;

  // number limits for order amount and total in order form
  private upperLimit = 9;
  private precisionLimit = 6;

  constructor(
    private numberFormatPipe: NumberFormatPipe,
    private appService: AppService,
    private currentpriceService: CurrentpriceService,
    private orderbookService: OrderbookService,
    private zone: NgZone
  ) { }

  ngOnInit() {
    this.model = {};

    this.addresses = window.electron.ipcRenderer.sendSync('getAddressesSync');

    this.appService.marketPairChanges.subscribe((symbols) => {
      this.symbols = symbols;
      // this.model = {};
      this.resetModel();
    });
    this.currentpriceService.currentprice.subscribe((cp) => {
      this.currentPrice = cp;
    });

    this.orderbookService.requestedOrder
      .subscribe((order) => {
        this.zone.run(() => {
          const tabIndex = order[4] === 'ask' ? 0 : 1;
          this.tabView.activeTab = this.tabView.tabs[tabIndex];
          this.resetModel();
          this.model = Object.assign(this.model, {
            id: order[2],
            amount: this.formatNumber(String(order[1]), this.symbols[0]),
            totalPrice: this.formatNumber(String(math.multiply(order[0], order[1])), this.symbols[1])
            // totalPrice: this.formatNumber(String(order[0] * order[1]), this.symbols[1])
          });
        });
      });

    this.orderTypes = [
      { value: 'exact', viewValue: 'Exact Order'}
    ];
  }

  validAmount(numStr: string): boolean {
    const { upperLimit, precisionLimit } = this;
    console.log(upperLimit, precisionLimit);
    const numPatt = /^(\d*)\.?(\d*)$/;
    if(!numPatt.test(numStr)) return false;
    const matches = numStr.match(numPatt);
    const int = matches[1];
    if(int.length > upperLimit) return false;
    const dec = matches[2];
    if(dec.length > precisionLimit) return false;
    return true;
  }

  showPopper(type: string, text: string, duration: number) {
    let showProp, textProp;
    switch(type) {
      case 'amount':
        showProp = 'amountPopperShow';
        textProp = 'amountPopperText';
        break;
      case 'total':
        showProp = 'totalPopperShow';
        textProp = 'totalPopperText';
        break;
    }
    this[textProp] = text;
    this[showProp] = true;
    setTimeout(() => {
      this[showProp] = false;
    }, duration);
  }

  amountChanged(e) {
    e.preventDefault();
    this.model.id = '';
    const { value } = e.target;
    const valid = this.validAmount(value);
    console.log('validAmount', valid);
    if(valid) {
      this.model.amount = value;
    } else {
      this.showPopper('amount', 'Oops! That was not right.', 5000);
      e.target.value = this.model.amount;
    }
  }

  totalPriceChanged(e) {
    e.preventDefault();
    this.model.id = '';
    const { value } = e.target;
    const valid = this.validAmount(value);
    if(valid) {
      this.model.totalPrice = value;
    } else {
      this.showPopper('total', 'Oops! That was not right.', 5000);
      e.target.value = this.model.totalPrice;
    }
  }

  makerAddressChanged(e) {
    e.preventDefault();
    this.model.makerAddress = e.target.value;
  }

  takerAddressChanged(e) {
    e.preventDefault();
    this.model.takerAddress = e.target.value;
  }

  onNumberInputBlur(field) {
    this.model[field] = this.formatNumber(this.model[field], field === 'amount' ? this.symbols[0] : this.symbols[1]);
  }

  upperCheck(num: string) {
    const splitNum = num.split('.');
    if(splitNum[0].length > 7) {
      splitNum[0] = splitNum[0].slice(-7);
    }
    return splitNum.join('.');
  }

  formatNumber(num:string, symbol:string): string {
    const format = symbol !== 'USD' ? `1.${this.precisionLimit}-${this.precisionLimit}` : '1.2-2';
    const formattedNumber = this.numberFormatPipe.transform(num, format);
    return this.upperCheck(formattedNumber);
  }

  calcPrice(event: any) { // without type info
    const enteredValue = event.target.value;
    const currPrice = parseFloat(this.currentPrice.last);
    this.totalPrice = enteredValue * currPrice;
  }

  resetModel() {
    this.model = {
      id: '',
      amount: '',
      totalPrice: '',
      makerAddress: this.addresses[this.symbols[0]] || '',
      takerAddress: this.addresses[this.symbols[1]] || ''
    };
  }

  validateNumber(numStr = '') {
    numStr = numStr.trim();
    return /\d+/.test(numStr) && /^\d*\.?\d*$/.test(numStr) && Number(numStr) !== 0;
  }

  onOrderSubmit() {
    const { ipcRenderer } = window.electron;
    const type = this.tabView.activeIndex === 0 ? 'buy' : 'sell';
    console.log('Submit order', type, this.model);
    const { id } = this.model;
    let { makerAddress = '', takerAddress = '', amount = '', totalPrice = '' } = this.model;
    makerAddress = makerAddress.trim();
    takerAddress = takerAddress.trim();
    amount = amount.trim();
    totalPrice = totalPrice.trim();

    if(
      !makerAddress ||
      !takerAddress ||
      !amount ||
      !this.validateNumber(amount) ||
      !totalPrice ||
      !this.validateNumber(totalPrice)
    ) return;

    this.addresses = Object.assign({}, this.addresses, {
      [this.symbols[0]]: makerAddress,
      [this.symbols[1]]: takerAddress
    });
    window.electron.ipcRenderer.send('saveAddress', this.symbols[0], makerAddress);
    window.electron.ipcRenderer.send('saveAddress', this.symbols[1], takerAddress);

    if(id) { // take order
      if(type === 'buy') {
        ipcRenderer.send('takeOrder', {
          id,
          sendAddress: takerAddress,
          receiveAddress: makerAddress
        });
      } else if(type === 'sell') {
        ipcRenderer.send('takeOrder', {
          id,
          sendAddress: makerAddress,
          receiveAddress: takerAddress
        });
      }
    } else { // make order
      if(type === 'buy') {
        ipcRenderer.send('makeOrder', {
          maker: this.symbols[1],
          makerSize: totalPrice,
          makerAddress: takerAddress,
          taker: this.symbols[0],
          takerSize: amount,
          takerAddress: makerAddress,
          type: 'exact'
        });
      } else if(type === 'sell') {
        ipcRenderer.send('makeOrder', {
          maker: this.symbols[0],
          makerSize: amount,
          makerAddress: makerAddress,
          taker: this.symbols[1],
          takerSize: totalPrice,
          takerAddress: takerAddress,
          type: 'exact'
        });
      }
    }
    this.resetModel();
  }
}
