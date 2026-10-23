import React from 'react'
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AddCampaign from './AddNewCampaign/AddNewCampaign';
import Filter from '../../../helper/filter/Filter';
import Breadcrumb from '../../../common/components/Breadcrumb';
import './AddNewCampaign/campaign.css';

const AddNewCampaign = () => {

  const navigate = useNavigate();
  const { t } = useTranslation();

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