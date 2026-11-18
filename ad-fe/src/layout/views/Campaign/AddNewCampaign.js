import React, { useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AddCampaign from './AddNewCampaign/AddNewCampaign';
import Filter from '../../../helper/filter/Filter';
import Breadcrumb from '../../../common/components/Breadcrumb';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { Toast } from '../../../helper/links/Link';
import './AddNewCampaign/campaign.css';

const AddNewCampaign = () => {

  const navigate = useNavigate();
  const { t } = useTranslation();
  const { loginUser } = useContext(ProfileContext) || {};
  const isMockUser = Boolean(loginUser?.isMockUser || localStorage.getItem("isMockUser") === "true");

  useEffect(() => {
    if (isMockUser) {
      Toast.error(t("Campaign creation is disabled in Demo Mode"));
      navigate("/campaigns", { replace: true });
    }
  }, [isMockUser, navigate, t]);

  if (isMockUser) {
    return null;
  }

  return (
    <>
      <Filter name={t("Campaigns")} isShowBackIcon={true} handleClick={() => navigate("/")} dateShow={false} profileShow={true} />

      <div className='px-4'>
        <Breadcrumb
          paths={[
            { label: t("Campaigns"), link: "/campaigns" },
            { label: t("Create Campaign") }
          ]}
          onBack={() => navigate("/campaigns")}
        />
      </div>
      <div className="middle_container relative" id="add-campaign-page">
        <div className="data_content data_content_btn m-0 overflow-hidden" style={{ borderRadius: "12px" }}>
          <AddCampaign />
        </div>
      </div>
    </>
  )
}

export default AddNewCampaign
