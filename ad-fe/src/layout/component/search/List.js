import React, { useState, useEffect } from 'react'
import { useTranslation } from "react-i18next";
import { CampaignNameCell } from "../../../utility/campaignNavigation";
function List({ listId }) {
  const { t } = useTranslation();
  const [searchData, setSearchData] = useState();

  const [searchString, setsearchString] = useState("");
  const [filterValue, setfilterValue] = useState('All');

  useEffect(() => {
    setSearchData(listId)
  }, [listId]);

  const handleChange = (e) => {
    const value = e.target.value.trimStart();
    setsearchString(value);

    const searchStr = value.trim().toLowerCase();
    let dataForSearch = listId;

    if (searchStr !== "") {
      const arr = dataForSearch?.filter((l) =>
        l.name.toLowerCase().includes(searchStr)
      );

      let filteredData;
      if (filterValue === 'All') {
        filteredData = arr
      }
      else {
        filteredData = arr.filter(x => x.type === filterValue)
      }

      setSearchData(filteredData);


    } else {
      let filteredData;
      if (filterValue === 'All') {
        filteredData = dataForSearch
      }
      else {
        filteredData = dataForSearch.filter(x => x.type === filterValue)
      }

      setSearchData(filteredData);

    }
  };


  const filterHandler = (val) => {


    setfilterValue(val)
    if (val === "All") {

      const filteredData = listId?.filter((l) =>
        l.name.toLowerCase().includes(searchString)
      );
      setSearchData(filteredData)




    }
    else {
      let arr = listId;

      let findArr = arr.filter(x => x.type === val)
      if (searchString) {
        const filteredData = findArr?.filter((l) =>
          l.name.toLowerCase().includes(searchString)
        );
        setSearchData(filteredData)
      }
      else {
        setSearchData(findArr)

      }


    }


  }


  return (

    <div className='assign_campaign_detail'>
      <div>
        <h6>{t("Filter Campaign Type:")} </h6>

        <div className='filter_type'>
          <button onClick={() => filterHandler('All')} className={`${filterValue === 'All' ? 'active' : ''} filter_name`}>{t("All")}</button>
          <button onClick={() => filterHandler('Sponsored Products')} className={`${filterValue === 'Sponsored Products' ? 'active' : ''} filter_name`}>{t("Products")}</button>
          <button onClick={() => filterHandler('Sponsored Brands')} className={`${filterValue === 'Sponsored Brands' ? 'active' : ''} filter_name`}>{t("Brands")}</button>
          <button onClick={() => filterHandler('Sponsored Display')} className={`${filterValue === 'Sponsored Display' ? 'active' : ''} filter_name`}>{t("Display")}</button>
        </div>

      </div>

      <div className='mt-2 search_section'>
        <h6>{t("Search Campaign:")} </h6>
        <input
          type="text"
          className='serach_text'
          value={searchString}
          onChange={(e) => handleChange(e)}
          placeholder={t("searchHere")}
        />
      </div>


      <div className='campaign_list'>
        <div className='list'>
          {
            searchData?.length === 0 ?
              <h6 className='text-center pt-2'> {t("Data Not Found")}</h6>
              :
              <div className='search_list'>
                {

                  searchData?.map((el, index) => {
                    const typeShort = el.type === "Sponsored Products" ? "SP" : el.type === "Sponsored Brands" ? "SB" : el.type === "Sponsored Display" ? "SD" : "Other";
                    const typeColor = el.type === "Sponsored Products" ? "#0d6efd" : el.type === "Sponsored Brands" ? "#198754" : el.type === "Sponsored Display" ? "#fd7e14" : "#6c757d";

                    return (
                      <div className='inner_list' key={index}>
                        <div className='flex items-center justify-between w-full pl-2 pr-1'>
                          <div className='m-0 pl-2 max-w-[80%] truncate'>
                            <CampaignNameCell row={el} name={el.name} campaignId={el.campaignId || el._id} />
                          </div>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '700',
                            color: typeColor,
                            background: `${typeColor}15`,
                            border: `1px solid ${typeColor}30`,
                            borderRadius: '4px',
                            padding: '1px 6px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                            whiteSpace: 'nowrap'
                          }}>
                            {typeShort}
                          </span>
                        </div>
                      </div>
                    )
                  })}
              </div>
          }
        </div>
      </div>

    </div>
  )
}

export default List