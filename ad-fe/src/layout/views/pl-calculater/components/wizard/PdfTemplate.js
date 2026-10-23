import React from 'react';
import { useTranslation } from "react-i18next";
import CurrencyFormat from "../../../../../helper/currencyCode/CurrencyFormat";
import Logo from "../../../../../common/logo/full-logo.png";

export default function PdfTemplate({ formData, metrics }) {
  const { t } = useTranslation();
  // Safe fallbacks
  const sp = formData?.sellingPrice || 0;
  const landedCost = formData?.landedCost || 0;
  const category = formData?.category || 'Electronics';
  const fulfillmentMethod = formData?.fulfillmentMode || 'easyship';
  const shippingZone = formData?.shippingZone || 'local';
  const weight = formData?.weight || 0;
  const packaging = formData?.packaging || 0;
  const acos = formData?.acos || 0;
  const returnRate = formData?.returnRate || 0;

  const netProfit = metrics?.netProfit || 0;
  const netMargin = metrics?.netMargin || 0;
  const roi = metrics?.roi || 0;
  const settlement = metrics?.settlement || 0;

  const bd = metrics?.breakdown || {};
  const amazonFees = (bd.referralFee || 0) + (bd.closingFee || 0) + (bd.shippingFee || 0) + (bd.gstOnFees || 0);
  const amazonFeePercent = sp > 0 ? (amazonFees / sp) * 100 : 0;
  const productPackagingCost = (bd.productCost || 0) + (bd.packaging || 0);
  const marketingReturnsCost = (bd.marketing || 0) + (bd.returnLoss || 0);

  const getInsightText = () => {
    if (netProfit < 0) {
      return {
        title: t("Currently Unprofitable"),
        desc: t("You are losing Rs.{{amount}} per unit. High costs or low margins are eating into your revenue.", { amount: CurrencyFormat(Math.abs(netProfit)) }),
        bullets: [
          t("Urgently review product landed cost or increase selling price."),
          t("Optimize ad spend (ACOS) and minimize returns."),
          t("Check if a different fulfillment method is more cost-effective.")
        ]
      };
    } else if (netMargin < 10) {
      return {
        title: t("Profitable, but margin is tight"),
        desc: t("You're keeping Rs.{{profit}} per unit, but {{feePercent}}% goes to Amazon fees. Small cost changes can flip this negative.", { profit: CurrencyFormat(netProfit), feePercent: CurrencyFormat(amazonFeePercent) }),
        bullets: [
          t("Lower ACOS by 3-5% via negative keywords and bid caps."),
          t("Renegotiate landed cost or move to slab/national shipping."),
          t("Test a Rs.50-Rs.100 price lift on hero SKUs before scaling ads.")
        ]
      };
    } else {
      return {
        title: t("Healthy Profit Margin"),
        desc: t("You're keeping Rs.{{profit}} per unit. A healthy margin provides room for aggressive marketing.", { profit: CurrencyFormat(netProfit) }),
        bullets: [
          t("Consider scaling ad spend to capture more market share."),
          t("Monitor return rates as volume increases."),
          t("Explore bundle offers to increase average order value.")
        ]
      };
    }
  };

  const insight = getInsightText();
  const currentDate = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div style={{ width: '794px', minHeight: '1123px', backgroundColor: '#fff', padding: '0', fontFamily: 'Inter, Arial, sans-serif', color: '#1f2937', display: 'flex', flexDirection: 'column' }}>
      
      {/* Premium Branded Header */}
      <div style={{ borderBottom: '2px solid #f3f4f6', padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={Logo} alt="AdvertiseIQ Logo" style={{ height: '36px', objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>advertiseiq.co</div>
      </div>

      <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Title Area */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 6px 0', color: '#111827', letterSpacing: '-0.02em' }}>{t("Amazon Profit Breakdown Report")}</h1>
          <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
            {t("Category:")} <span style={{ textTransform: 'capitalize', color: '#374151', fontWeight: '600' }}>{category.replace(/([A-Z])/g, ' $1').trim()}</span> &bull; {t("Target Price:")} <span style={{ color: '#374151', fontWeight: '600' }}>Rs.{sp}</span>
          </div>
        </div>

        {/* Highlight Result Box */}
        <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '12px', padding: '20px 24px', marginBottom: '32px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>{t("PROJECTED NET MARGIN")}</div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#1e3a8a', lineHeight: '1.3', marginBottom: '8px' }}>
            {t("Net Profit: Rs.{{amount}} / unit", { amount: CurrencyFormat(netProfit) })}
          </div>
          <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '500', marginTop: '6px' }}>
            <strong>{t("{{pct}}% Margin", { pct: CurrencyFormat(netMargin) })}</strong> &nbsp;·&nbsp; {t("ROI:")} <strong>{CurrencyFormat(roi)}%</strong>
          </div>

        </div>

        {/* Tables Container */}
        <div style={{ display: 'flex', gap: '40px', marginBottom: '32px' }}>
          
          {/* Inputs Section */}
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563', margin: '0 0 12px 0', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>{t("Input Parameters")}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {[
                  { label: t('Selling Price (SP)'), val: `Rs.${sp}` },
                  { label: t('Product Cost (Landed)'), val: `Rs.${landedCost}` },
                  { label: t('Fulfillment Mode'), val: fulfillmentMethod.toUpperCase() },
                  { label: t('Shipping Zone'), val: shippingZone.charAt(0).toUpperCase() + shippingZone.slice(1) },
                  { label: t('Weight'), val: `${weight} kg` },
                  { label: t('Packaging Cost'), val: `Rs.${packaging}` },
                  { label: t('Target ACOS'), val: `${acos}%` },
                  { label: t('Return Rate'), val: `${returnRate}%` }
                ].map((item, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 0', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{item.label}</td>
                    <td style={{ padding: '8px 0', fontWeight: '700', textAlign: 'right', color: '#111827', borderBottom: '1px solid #f3f4f6' }}>{item.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key Metrics Section */}
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563', margin: '0 0 12px 0', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>{t("Key Metrics & Breakdown")}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 0', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
                    {t("Settlement")} <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>{t("(after Amazon fees)")}</span>
                  </td>
                  <td style={{ padding: '8px 0', fontWeight: '700', textAlign: 'right', color: '#2563eb', borderBottom: '1px solid #f3f4f6' }}>Rs.{CurrencyFormat(settlement)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{t("Amazon Fees Total")}</td>
                  <td style={{ padding: '8px 0', fontWeight: '700', textAlign: 'right', color: '#dc2626', borderBottom: '1px solid #f3f4f6' }}>-Rs.{CurrencyFormat(amazonFees)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{t("Product & Packaging Cost")}</td>
                  <td style={{ padding: '8px 0', fontWeight: '700', textAlign: 'right', color: '#dc2626', borderBottom: '1px solid #f3f4f6' }}>-Rs.{CurrencyFormat(productPackagingCost)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{t("Marketing & Returns Cost")}</td>
                  <td style={{ padding: '8px 0', fontWeight: '700', textAlign: 'right', color: '#dc2626', borderBottom: '1px solid #f3f4f6' }}>-Rs.{CurrencyFormat(marketingReturnsCost)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 0', fontWeight: '700', color: '#111827' }}>{t("Net profit per unit")}</td>
                  <td style={{ padding: '12px 0', fontWeight: '800', fontSize: '15px', textAlign: 'right', color: netProfit >= 0 ? '#10b981' : '#dc2626' }}>Rs.{CurrencyFormat(netProfit)}</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

        {/* Insight Box */}
        <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '32px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>
            {insight.title}
          </div>
          <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '14px', lineHeight: '1.6' }}>
            {insight.desc}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {insight.bullets.map((bullet, idx) => (
              <div key={idx} style={{ fontSize: '12.5px', color: '#4b5563', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>&bull;</span>
                <span style={{ lineHeight: '1.5' }}>{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footers positioned at the bottom of the A4 page */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid #f3f4f6', paddingTop: '20px' }}>
          <div style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic', marginBottom: '16px', lineHeight: '1.5' }}>
            {t("* Fees based on Amazon.in April 2026 published rate cards. Actual settlement may vary with store promotions, coupons, and GST input credit. Prepared by AdvertiseIQ.")}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#9ca3af', fontWeight: '500' }}>
            <div>AdvertiseIQ &bull; www.advertiseiq.co &bull; contact@advertiseiq.co</div>
            <div style={{ fontStyle: 'italic' }}>{t("Report generated on {{date}}", { date: currentDate })}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
