import { useTranslation } from "react-i18next";
import { useContext, useState } from 'react';
import { ApiSaveAcos, ApiGetAcos, ApiSaveOtherAcos, ApiSaveCampaginTargetAcos } from '../../../api-wrapper/campaign-setting/ApiSettings';
import { useEffect } from 'react';
import { Accordion } from '../../../components/ui/accordion';
import { Toast } from '../../../helper/links/Link';
import Filter from '../../../helper/filter/Filter';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { t } from 'i18next';
import HealthScoreSetting from './Setting/HealthScoreSetting';
import PerformanceScoreSetting from './Setting/PerformanceScoreSetting';
import { useNavigate } from "react-router-dom";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Checkbox } from "../../../components/ui/checkbox";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";

function CampaignSetting() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profileId, selectedAdType } = useContext(ProfileContext)
  const [val, setVal] = useState([]);
  const [sb, setSB] = useState([]);
  const [sd, setSD] = useState([]);
  const [campaignTargetACOS, setCampaignTargetACOS] = useState(0);
  const [bidLimitTargetACOS, setBidLimitTargetACOS] = useState(0);
  const [productEligibilityThreshold, setProductEligibilityThreshold] = useState(0);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  const hasUpdatePermission = PermissionCheck(SYSTEM_PAGES.CAMPAIGN_SETTING, PAGE_ACTIONS.UPDATE);

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const changeHandler = (e, el, name) => {
    if (e.target.type === 'checkbox') {
      el[name] = e.target.checked
    } else {
      if (name === "dynamicPPtargetAcos" || name === 'dynamicTOStargetAcos' || name === 'dynamicROStargetAcos') {
        el.Acos = Number(e.target.value)
      } else {
        el[name] = Number(e.target.value);
      }
    }
    setVal([...val]);
  }

  const campaignTargetACOSSaveHandler = () => {
    ApiSaveCampaginTargetAcos({ profileId: profileId?.value, targetAcos: campaignTargetACOS, bidLimitTargetACOS: bidLimitTargetACOS, productEligibilityThreshold })
      .then((e) => {
        if (e?.isSuccess) Toast.success(e?.message);
        else Toast.error(e?.message);
      })
      .catch((e) => Toast.error(t("Something went wrong")));
  }

  const saveHandler = (el) => {
    const data = {
      profileId: profileId?.value,
      type: el.type,
      TOStargetAcos: el.TOStargetAcos,
      PPtargetAcos: el.PPtargetAcos,
      ROStargetAcos: el.ROStargetAcos,
      dynamicTOStargetAcos: el.dynamicTOStargetAcos,
      dynamicPPtargetAcos: el.dynamicPPtargetAcos,
      dynamicROStargetAcos: el.dynamicROStargetAcos,
      dynamicTOSTarget: el.dynamicTOSTarget || false,
      dynamicPPTarget: el.dynamicPPTarget || false,
      dynamicROSTarget: el.dynamicROSTarget || false
    }

    ApiSaveAcos(data)
      .then((e) => {
        if (e?.isSuccess) {
          Toast.success(e?.message);
        } else {
          Toast.error(e?.message);
        }
      })
      .catch((e) => {
        Toast.error(t("Something went wrong"));
      });
  }

  const SBsaveHandler = (el, type) => {
    const data = {
      profileId: profileId?.value,
      type: el.type,
      targetAcos: el.targetAcos,
      campaignType: type
    }

    ApiSaveOtherAcos(data)
      .then((e) => {
        if (e?.isSuccess) {
          Toast.success(e?.message);
        } else {
          Toast.error(e?.message);
        }
      })
      .catch((e) => {
        Toast.error(t("Something went wrong"));
      });
  }

  useEffect(() => {
    const HandleGetData = () => {
      const data = {
        profileId: profileId?.value,
      }
      ApiGetAcos(data)
        .then((e) => {
          if (e?.isSuccess) {

            setVal(e?.spData)
            setSB(e.sbData)
            setSD(e.sdData)
            setCampaignTargetACOS(e?.campaignSetting?.targetAcos);
            setBidLimitTargetACOS(e?.campaignSetting?.bidLimitTargetACOS);
            setProductEligibilityThreshold(e?.campaignSetting?.productEligibilityThreshold);

          } else {
            Toast.error(e?.message);
          }
        })
        .catch((e) => {
          Toast.error(t("Something went wrong"));
        });
    }

    if (profileId?.value && selectedAdType) HandleGetData()
  }, [profileId?.value, selectedAdType]);

  return (

    <>
      <div className='bg-white'>
        <Filter name={"Campaign Setting"} dateShow={false} profileShow={true} />
      </div>

      <div className='middle_container addfilter_container acos_filter'>
        <div className="pt-3 pb-2">
          <Breadcrumb
            paths={[
              { label: t("Campaigns"), link: "/campaigns" },
              { label: t("Campaign Settings") }
            ]}
            onBack={() => navigate("/campaigns")}
          />
        </div>

        {/* Sponsored Products Card */}
        <div id="sp-campaign-settings" className="glass-grid-container overflow-hidden" style={{ padding: "28px", marginTop: "16px", background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.4)", backdropFilter: "blur(20px)", borderRadius: "16px", border: isDark ? "1px solid #334155" : "1px solid rgba(255, 255, 255, 0.5)", marginBottom: "20px" }}>
          <div className='data_content data_content_btn' style={{ background: "transparent", border: "none", boxShadow: "none", margin: 0, padding: 0 }}>

            {/* Elegant Section Header */}
            <div className="flex justify-between items-center" style={{ borderBottom: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)", paddingBottom: "16px", marginBottom: "24px" }}>
              <div>
                <h5 style={{ fontWeight: 800, color: isDark ? "#f8fafc" : "#0f172a", margin: 0, fontSize: "16px", letterSpacing: "-0.02em" }}>{t("Sponsored Products Settings")}</h5>
                <p style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "12px", margin: "4px 0 0 0" }}>{t("Configure global defaults for product eligibility thresholds and ACOS caps.")}</p>
              </div>
            </div>

            {/* Premium Flex Form Config Row */}
            <div style={{ background: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.6)", border: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)", borderRadius: 12, padding: "20px", boxShadow: isDark ? "none" : "0 4px 20px rgba(2, 70, 139, 0.02)" }}>
              <div className="flex flex-wrap items-end gap-4">

                {/* Field 1 */}
                <div style={{ flex: "1 1 220px" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5e9", display: "inline-block", boxShadow: "0 0 8px #0ea5e9" }}></span>
                    <label className="font-bold text-slate-800 dark:text-slate-100" style={{ fontSize: "12px", margin: 0, color: isDark ? "#f8fafc" : "#1e293b", fontWeight: 700 }}>{t("Product Eligibility Threshold")}</label>
                  </div>
                  <Input
                    type="number"
                    className="w-full h-[38px]"
                    value={productEligibilityThreshold}
                    onChange={(e) => setProductEligibilityThreshold(e?.target?.value)}
                    disabled={!hasUpdatePermission}
                  />
                </div>

                {/* Field 2 */}
                <div style={{ flex: "1 1 220px" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", display: "inline-block", boxShadow: "0 0 8px #6366f1" }}></span>
                    <label className="font-bold text-slate-800 dark:text-slate-100" style={{ fontSize: "12px", margin: 0, color: isDark ? "#f8fafc" : "#1e293b", fontWeight: 700 }}>{t("Default Target ACOS (%)")}</label>
                  </div>
                  <Input
                    type="number"
                    className="w-full h-[38px]"
                    value={campaignTargetACOS}
                    onChange={(e) => setCampaignTargetACOS(e?.target?.value)}
                    disabled={!hasUpdatePermission}
                  />
                </div>

                {/* Field 3 */}
                <div style={{ flex: "1 1 220px" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", display: "inline-block", boxShadow: "0 0 8px #a855f7" }}></span>
                    <label className="font-bold text-slate-800 dark:text-slate-100" style={{ fontSize: "12px", margin: 0, color: isDark ? "#f8fafc" : "#1e293b", fontWeight: 700 }}>{t("Bid Limit Target ACOS (%)")}</label>
                  </div>
                  <Input
                    type="number"
                    className="w-full h-[38px]"
                    value={bidLimitTargetACOS}
                    onChange={(e) => setBidLimitTargetACOS(e?.target?.value)}
                    disabled={!hasUpdatePermission}
                  />
                </div>

                {/* Action Button */}
                <div>
                  <button
                    id="sp-campaign-save-btn"
                    className="m-0"
                    style={{
                      height: "38px",
                      padding: "0 22px",
                      fontSize: "13px",
                      fontWeight: "600",
                      background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#ffffff",
                      boxShadow: "0 4px 12px rgba(2, 70, 139, 0.2)",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(2, 70, 139, 0.3)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(2, 70, 139, 0.2)"; }}
                    onClick={() => { if (hasUpdatePermission) campaignTargetACOSSaveHandler(); }}
                    disabled={!hasUpdatePermission}
                  >
                    {t("Save Settings")}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Health Score Table Card */}
        <div className="glass-grid-container overflow-hidden" style={{ marginBottom: "20px" }}>
          <HealthScoreSetting targetACOS={campaignTargetACOS} />
        </div>

        {/* Performance Score Table Card */}
        <div className="glass-grid-container overflow-hidden" style={{ marginBottom: "20px" }}>
          <PerformanceScoreSetting targetACOS={campaignTargetACOS} />
        </div>
        <div className=' py-4 px-3 hidden'>
          <div className='fw-bolder text-blue px-3 py-2 h6'>
            {t("Placement Target ACOS")}
          </div>
          <table>
            <tr>
              <th>{t("Type")}</th>
              <th>{t("Top Of Search")}</th>
              <th>{t("Dynamic Target ACOS")}</th>
              <th>{t("Rest of Search")}</th>
              <th>{t("Dynamic Target ACOS")}</th>
              <th>{t("Product Pages")}</th>
              <th>{t("Dynamic Target ACOS")}</th>
              <th>{t("Action")}</th>

            </tr>
            {
              val?.map(el => {
                return (
                  <>
                    <tr>
                      <td><b>{el?.displayType ?? el?.type} </b></td>
                      <td><Input type='number' className="h-8 min-w-[70px]" data-name={el.TOStargetAcos} value={el.TOStargetAcos} onChange={(e) => changeHandler(e, el, "TOStargetAcos")} /></td>
                      <td>
                        <div className="flex justify-center items-center">
                          <Checkbox className="h-4 w-4" checked={el.dynamicTOSTarget} value={el.dynamicTOSTarget} onChange={(e) => changeHandler(e, el, "dynamicTOSTarget")} />
                        </div>
                      </td>
                      <td><Input type='number' className="h-8 min-w-[70px]" data-name={el.ROStargetAcos} value={el.ROStargetAcos} onChange={(e) => changeHandler(e, el, "ROStargetAcos")} /></td>
                      <td>
                        <div className="flex justify-center items-center">
                          <Checkbox className="h-4 w-4" checked={el.dynamicROSTarget} value={el.dynamicROSTarget} onChange={(e) => changeHandler(e, el, "dynamicROSTarget")} />
                        </div>
                      </td>
                      <td><Input type='number' className="h-8 min-w-[70px]" data-name={el.PPtargetAcos} value={el.PPtargetAcos} onChange={(e) => changeHandler(e, el, "PPtargetAcos")} /></td>
                      <td>
                        <div className="flex justify-center items-center">
                          <Checkbox className="h-4 w-4" checked={el.dynamicPPTarget} value={el.dynamicPPTarget} onChange={(e) => changeHandler(e, el, "dynamicPPTarget")} />
                        </div>
                      </td>
                      <td className='save_btn' style={{ background: "none" }}><Button className="improve add_btn h-[32px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-3 text-xs font-semibold shadow-sm flex items-center justify-center m-auto" onClick={() => saveHandler(el)}>{t("save")}</Button></td>
                    </tr>
                    <tr>
                      <td colSpan={8} className='accordian_css'>
                        <Accordion >
                          <Accordion.Item eventKey="0">
                            <Accordion.Header>{t("Top Of Search")}</Accordion.Header>
                            <Accordion.Body>
                              <table style={{ width: "100%" }}>
                                <tr>
                                  <th>{t("cvr")}</th>
                                  <th>{t("Target Acos")}</th>
                                </tr>
                                {
                                  el.dynamicTOStargetAcos.map((item, index) => {
                                    return (
                                      <>
                                        <tr colSpan={8} key={`dynamicTOStargetAcos_${index}`}>
                                          <td>
                                            {item.from} - {item.to} %
                                          </td>
                                          <td><Input type='number' className="h-8 min-w-[70px]" data-name={item._id} value={item.Acos} onChange={(e) => changeHandler(e, item, 'dynamicTOStargetAcos')} /></td>
                                        </tr>
                                      </>
                                    )
                                  })
                                }
                              </table>
                            </Accordion.Body>
                          </Accordion.Item>
                          <Accordion.Item eventKey="1">
                            <Accordion.Header>{t("Rest of Search")}</Accordion.Header>
                            <Accordion.Body>
                              <table style={{ width: "100%" }}>
                                <tr>
                                  <th>{t("cvr")}</th>
                                  <th>{t("Target Acos")}</th>
                                </tr>
                                {
                                  el.dynamicROStargetAcos.map((item, index) => {
                                    return (
                                      <>
                                        <tr colSpan={8} key={`dynamicROStargetAcos_${index}`}>
                                          <td>
                                            {item.from} - {item.to} %
                                          </td>
                                          <td><Input type='number' className="h-8 min-w-[70px]" data-name={item._id} value={item.Acos} onChange={(e) => changeHandler(e, item, "dynamicROStargetAcos")} /></td>
                                        </tr>
                                      </>
                                    )
                                  })
                                }
                              </table>

                            </Accordion.Body>
                          </Accordion.Item>
                          <Accordion.Item eventKey="2">
                            <Accordion.Header>{t("Product Pages")}</Accordion.Header>
                            <Accordion.Body>
                              <table style={{ width: "100%" }}>
                                <tr>
                                  <th>{t("cvr")}</th>
                                  <th>{t("Target Acos")}</th>
                                </tr>
                                {
                                  el.dynamicPPtargetAcos.map((item, index) => {
                                    return (
                                      <>
                                        <tr colSpan={8} key={`dynamicPPtargetAcos_${index}`} >
                                          <td>
                                            {item.from} - {item.to} %
                                          </td>
                                          <td><Input type='number' className="h-8 min-w-[70px]" data-name={item._id} value={item.Acos} onChange={(e) => changeHandler(e, item, "dynamicPPtargetAcos")} /></td>
                                        </tr>
                                      </>
                                    )
                                  })
                                }
                              </table>
                            </Accordion.Body>
                          </Accordion.Item>
                        </Accordion>
                      </td>
                    </tr>
                  </>
                )
              })
            }
          </table>
        </div>


        <div className='data_content data_content_btn mt-3 hidden'>
          <div className='data_modal_btn'>
            <h5>Sponsored Brands (Set Default Target ACOS) </h5>
          </div>
          <div className=' py-4 px-3'>

            <table>
              <tr>
                <th>Type</th>
                <th>Acos Value</th>
                <th>Action</th>

              </tr>
              {
                sb?.map(el => {
                  return (
                    <tr>
                      <td><b>{el.type} </b></td>
                      <td><Input type='number' className="h-8 min-w-[70px]" data-name={el.targetAcos} value={el.targetAcos} onChange={(e) => changeHandler(e, el, "targetAcos")} /></td>
                      <td className='save_btn' style={{ background: "none" }}><Button className="improve add_btn h-[32px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-3 text-xs font-semibold shadow-sm flex items-center justify-center m-auto" onClick={() => SBsaveHandler(el, "Sponsored Brands")}>Save</Button></td>

                    </tr>
                  )
                })
              }
            </table>


          </div>
        </div>

        <div className='data_content data_content_btn mt-3 hidden'>
          <div className='data_modal_btn'>
            <h5>Sponsored Display (Set Default Target ACOS) </h5>
          </div>
          <div className=' py-4 px-3'>

            <table>
              <tr>
                <th>Type</th>
                <th>Acos Value</th>
                <th>Action</th>

              </tr>
              {
                sd?.map(el => {
                  return (
                    <tr>
                      <td><b>{el.type} </b></td>
                      <td><Input type='number' className="h-8 min-w-[70px]" data-name={el.targetAcos} value={el.targetAcos} onChange={(e) => changeHandler(e, el, "targetAcos")} /></td>
                      <td className='save_btn' style={{ background: "none" }}><Button className="improve add_btn h-[32px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-3 text-xs font-semibold shadow-sm flex items-center justify-center m-auto" onClick={() => SBsaveHandler(el, "Sponsored Display")}>Save</Button></td>

                    </tr>
                  )
                })
              }
            </table>


          </div>
        </div>
      </div>


    </>


  )
}

export default CampaignSetting