import stripe from 'stripe';
import * as fs from 'fs';
import appConfig from '../../../../config/app.config';
import { Fetch } from '../../Fetch';

let _stripe: stripe | undefined;

function getStripe(): stripe {
  if (!_stripe) {
    _stripe = new stripe(appConfig().payment.stripe.secret_key, {
      apiVersion: '2025-03-31.basil',
    });
  }
  return _stripe;
}

export class StripePayment {


  /*-----------------------------------------
            important Schema start
  -----------------------------------------*/

  // create payment method
  static async createPaymentMethod({
    card,
    billing_details,
  }: {
    card: stripe.PaymentMethodCreateParams.Card;
    billing_details: stripe.PaymentMethodCreateParams.BillingDetails;
  }): Promise<stripe.PaymentMethod> {
    const paymentMethod = await getStripe().paymentMethods.create({
      card: {
        number: card.number,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        cvc: card.cvc,
      },
      billing_details: billing_details,
    });
    return paymentMethod;
  }

  // create payment intent
  static async createPaymentIntent({
    amount,
    currency,
    customer_id,
    metadata,
  }: {
    amount: number;
    currency: string;
    customer_id: string;
    metadata?: stripe.MetadataParam;
  }): Promise<stripe.PaymentIntent> {
    return getStripe().paymentIntents.create({
      amount: amount * 100, // amount in cents
      currency: currency,
      customer: customer_id,
      metadata: metadata,
    });
  }

  // create customer
  static async createCustomer({
    user_id,
    name,
    email,
  }: {
    user_id: string;
    name: string;
    email: string;
  }): Promise<stripe.Customer> {
    const customer = await getStripe().customers.create({
      name: name,
      email: email,
      metadata: {
        user_id: user_id,
      },
      description: 'New Customer',
    });
    return customer;
  }




  /*-----------------------------------------
            important Schema end
  -----------------------------------------*/


  /*-----------------------------------------
         withdraw Schema start
  -----------------------------------------*/

  // create connected account
  static async createConnectedAccount(email: string) {
    const connectedAccount = await getStripe().accounts.create({
      type: 'express',
      email: email,
      country: 'US', // change as per user's country
      // business_profile: {
      //   url: appConfig().app.url,
      // },
      // settings: {
      //   payouts: {
      //     schedule: {
      //       interval: 'manual',
      //     },
      //   },
      // },
      capabilities: {
        // card_payments: {
        //   enabled: true,
        // },
        transfers: {
          // enabled: true,
          requested: true,
        },
      },
    });

    return connectedAccount;
  }

  // Stripe Connect onboarding.
  static async createOnboardingAccountLink(account_id: string) {
    const accountLink = await getStripe().accountLinks.create({
      account: account_id,
      refresh_url: appConfig().app.url,
      return_url: appConfig().app.url,
      type: 'account_onboarding',
    });
    return accountLink;
  }


  // transfer money to account
  static async createTransfer(
    account_id: string,
    amount: number,
    currency: string,
  ) {
    const transfer = await getStripe().transfers.create({
      amount: amount * 100,
      currency: currency,
      destination: account_id,
    });
    return transfer;
  }


  /*-----------------------------------------
         withdraw Schema end
  -----------------------------------------*/






  static async attachCustomerPaymentMethodId({
    customer_id,
    payment_method_id,
  }: {
    customer_id: string;
    payment_method_id: string;
  }): Promise<stripe.PaymentMethod> {
    const customer = await getStripe().paymentMethods.attach(payment_method_id, {
      customer: customer_id,
    });
    return customer;
  }

  static async setCustomerDefaultPaymentMethodId({
    customer_id,
    payment_method_id,
  }: {
    customer_id: string;
    payment_method_id: string;
  }): Promise<stripe.Customer> {
    const customer = await getStripe().customers.update(customer_id, {
      invoice_settings: {
        default_payment_method: payment_method_id,
      },
    });
    return customer;
  }

  static async updateCustomer({
    customer_id,
    name,
    email,
  }: {
    customer_id: string;
    name: string;
    email: string;
  }): Promise<stripe.Customer> {
    const customer = await getStripe().customers.update(customer_id, {
      name: name,
      email: email,
    });
    return customer;
  }

  /**
   * Get customer using id
   * @param id
   * @returns
   */
  static async getCustomerByID(id: string): Promise<stripe.Customer> {
    const customer = await getStripe().customers.retrieve(id);
    return customer as stripe.Customer;
  }

  /**
   * Create billing portal session
   * @param customer
   * @returns
   */
  static async createBillingSession(customer: string) {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customer,
      return_url: appConfig().app.url,
    });
    return session;
  }



  /**
   * Create stripe hosted checkout session
   * @param customer
   * @param price
   * @returns
   */
  static async createCheckoutSession() {
    const success_url = `${appConfig().app.url
      }/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${appConfig().app.url}/failed`;

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Sample Product',
            },
            unit_amount: 2000, // $20.00
          },
          quantity: 1,
        },
      ],

      success_url: success_url,
      cancel_url: cancel_url,
      // automatic_tax: { enabled: true },
    });
    return session;
  }

  /**
   * Create stripe hosted checkout session
   * @param customer
   * @param price
   * @returns
   */
  static async createCheckoutSessionSubscription(
    customer: string,
    price: string,
  ) {
    const success_url = `${appConfig().app.url
      }/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${appConfig().app.url}/failed`;

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customer,
      line_items: [
        {
          price: price,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: success_url,
      cancel_url: cancel_url,
      // automatic_tax: { enabled: true },
    });
    return session;
  }

  /**
   * Calculate taxes
   * @param amount
   * @returns
   */
  static async calculateTax({
    amount,
    currency,
    customer_details,
  }: {
    amount: number;
    currency: string;
    customer_details: stripe.Tax.CalculationCreateParams.CustomerDetails;
  }): Promise<stripe.Tax.Calculation> {
    const taxCalculation = await getStripe().tax.calculations.create({
      currency: currency,
      customer_details: customer_details,
      line_items: [
        {
          amount: amount * 100,
          tax_behavior: 'exclusive',
          reference: 'tax_calculation',
        },
      ],
    });
    return taxCalculation;
  }

  // create a tax transaction
  static async createTaxTransaction(
    tax_calculation: string,
  ): Promise<stripe.Tax.Transaction> {
    const taxTransaction = await getStripe().tax.transactions.createFromCalculation({
      calculation: tax_calculation,
      reference: 'tax_transaction',
    });
    return taxTransaction;
  }

  // download invoice using payment intent id
  static async downloadInvoiceUrl(
    payment_intent_id: string,
  ): Promise<string | null> {
    const invoice = await getStripe().invoices.retrieve(payment_intent_id);
    // check if the invoice has  areceipt url
    if (invoice.hosted_invoice_url) {
      return invoice.hosted_invoice_url;
    }
    return null;
  }

  // download invoice using payment intent id
  static async downloadInvoiceFile(payment_intent_id: string) {
    const invoice = await getStripe().invoices.retrieve(payment_intent_id);

    if (invoice.hosted_invoice_url) {
      const response = await Fetch.get(invoice.hosted_invoice_url, {
        responseType: 'stream',
      });

      // save the response to a file
      return fs.writeFileSync('receipt.pdf', response.data);
    } else {
      return null;
    }
  }

  // send invoice to email using payment intent id
  static async sendInvoiceToEmail(payment_intent_id: string) {
    const invoice = await getStripe().invoices.sendInvoice(payment_intent_id);
    return invoice;
  }

  // -----------------------payout system start--------------------------------

  // If you are paying users, they need Stripe Connect accounts. You can create Express or Standard accounts.





  // Once the user has an approved Stripe account with a linked bank, you can send them funds.
  static async createPayout(
    account_id: string,
    amount: number,
    currency: string,
  ) {
    const payout = await getStripe().payouts.create(
      {
        amount: amount * 100, // amount in cents
        currency: currency,
      },
      {
        stripeAccount: account_id, // context of connected account
      },
    );

    return payout;
  }

  // check balance of account
  static async checkBalance(account_id: string) {
    const balance = await getStripe().balance.retrieve({
      stripeAccount: account_id,
    });
    return balance;
  }

  // static async createPayout(amount: number, currency: string) {
  //   const payout = await getStripe().payouts.create({
  //     amount: amount * 100,
  //     currency: currency,
  //   });
  //   return payout;
  // }
  // -----------------------payout system end--------------------------------

  // ACH payment
  static async createToken() {
    const token = await getStripe().tokens.create({
      bank_account: {
        country: 'US',
        currency: 'usd',
        routing_number: '110000000',
        account_number: '000123456789',
        account_holder_name: 'Jane Doe',
        account_holder_type: 'individual',
      },
    });
    return token;
  }

  static async createBankAccount(customerId: string, bankAccountToken: string) {
    const bankAccount = await getStripe().customers.createSource(customerId, {
      source: bankAccountToken,
    });
    return bankAccount;
  }

  static async verifyBankAccount(
    customerId: string,
    bankAccountId: string,
    amounts: [number, number],
  ) {
    return getStripe().customers.verifySource(customerId, bankAccountId, {
      amounts,
    });
  }

  static async createACHPaymentIntent(customerId: string, amount: number) {
    return await getStripe().paymentIntents.create({
      amount: amount * 100,
      currency: 'usd',
      customer: customerId,
      payment_method_types: ['us_bank_account'],
      payment_method_options: {
        us_bank_account: {
          verification_method: 'automatic',
        },
      },
    });
    // return await getStripe().checkout.sessions.create({
    //   mode: 'payment',
    //   customer: customerId,
    //   payment_method_types: ['card', 'us_bank_account'],
    //   payment_method_options: {
    //     us_bank_account: {
    //       verification_method: 'automatic',
    //     },
    //   },
    //   line_items: [
    //     {
    //       price_data: {
    //         currency: 'usd',
    //         unit_amount: amount * 100,
    //         product_data: {
    //           name: 'T-shirt',
    //         },
    //       },
    //       quantity: 1,
    //     },
    //   ],
    //   success_url: 'https://example.com/success',
    //   cancel_url: 'https://example.com/cancel',
    // });
  }
  // end ACH

  static async createCheckoutSessionForBooking({
    amount,
    currency,
    bookingId,
    listingTitle,
    successUrl,
    cancelUrl,
  }: {
    amount: number;
    currency: string;
    bookingId: string;
    listingTitle: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<stripe.Checkout.Session> {
    return getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: listingTitle },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: { booking_id: bookingId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  static handleWebhook(rawBody: string, sig: string | string[]): stripe.Event {
    const event = getStripe().webhooks.constructEvent(
      rawBody,
      sig,
      appConfig().payment.stripe.webhook_secret,
    );
    return event;
  }
}
