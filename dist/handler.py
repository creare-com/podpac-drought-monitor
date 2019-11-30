"""
PODPAC-DROUGHT-MONITOR SMAP-DATA-UPDATER AWS Handler
"""

import sys
import os

def handler(event, context):
    """Lambda function handler
    
    Parameters
    ----------
    event : dict
        Description
    context : TYPE
        Description
    """
    print(event)
    
    sys.path.append("/tmp/")
    bucket = 'podpac-internal-test'

    # get dependencies path
    if "FUNCTION_DEPENDENCIES_KEY" in os.environ:
        dependencies = os.environ["FUNCTION_DEPENDENCIES_KEY"]
    else:
        dependencies = "podpac_deps_{}.zip".format(
            'os.environ["PODPAC_VERSION"]'
        )  # this should be equivalent to version.semver()

    # Download dependencies from specific bucket/object
    s3 = boto3.client("s3")
    s3.download_file(bucket, dependencies, "/tmp/" + dependencies)
    subprocess.call(["unzip", "/tmp/" + dependencies, "-d", "/tmp"])
    sys.path.append("/tmp/")
    subprocess.call(["rm", "/tmp/" + dependencies])
    
    
    import matplotlib

    matplotlib.use("agg")
    import datetime
    import podpac
    import xarray as xr
    import zarr

    from podpac import settings
    import podpac.datalib
    from podpac.datalib import smap_egi
    
    
    bucket = "podpac-internal-test"
    source = 's3://%s/%s' % (bucket, 'SPL3SMP_E.002_9km_aid0001.zarr')
    source2 = 's3://%s/%s' % (bucket, 'SPL4SMGP.004_9km_aid0001.zarr')

    kwargs = {'dims': ['time', 'lat', 'lon'], 'latkey': 'fakedim0', 'lonkey': 'fakedim1',
              'cf_time': True, 'cf_calendar': 'proleptic_gregorian', 'cf_units': 'days since 2000-01-01',
             'crs': 'epsg:6933', 'nan_vals': [-9999]}

    print("Opening L4 Zarr dataset.")
    smap_zarr_L4 = podpac.data.Zarr(source=source2, datakey='Geophysical_Data_sm_surface', file_mode='a', **kwargs)
    smap_ds_L4 = smap_zarr_L4.dataset

    print("Creating L4 Coordinates")
    coords_l4 = smap_zarr_L4.native_coordinates.drop('time')
    time = podpac.crange(smap_zarr_L4.native_coordinates['time'].bounds[-1], str(datetime.date.today()), '1,D', 'time')
    coords_l4 = podpac.coordinates.merge_dims([podpac.Coordinates([time],  crs=coords_l4.crs), coords_l4])

    # Get all the new data
    # L4 data
    print("Downloading the new L4 Data")
    smap = smap_egi.SMAP(product='SPL4SMAU')
    l4 = smap.eval(coords_l4)
    l4.set(-9999, np.isnan(l4))
    time_base = xr.coding.times.decode_cf_datetime(0, smap_ds_L4['time'].attrs['units'])
    new_times = (coords_l4.coords['time'].data - time_base).astype('timedelta64[D]')

    I = new_times > smap_ds_L4['time'][:].max()
    old_time_shape = smap_ds_L4['time'].shape
    old_data_shape = smap_ds_L4['Geophysical_Data_sm_surface'].shape
    
    print ('Updating {} new times for L4 data.'.format(I.sum()))
    try: 
        # Update the zarr file
        ## IMPORTANT ONLY EXECUTE THIS CELL ONCE!!!! ANY ERRORS? DO NOT EXECUTE THE SAME APPEND AGAIN!
        smap_ds_L4['time'].append(new_times[I])
        smap_ds_L4['Geophysical_Data_sm_surface'].append(l4[I], axis=0)
    except as e:  # Fails silently
        print ('Updating L4 data failed:', e)
        smap_ds_L4['time'].reshape(old_time_shape)
        smap_ds_L4['Geophysical_Data_sm_surface'].reshape(old_data_shape)


    # AM/PM Data
    print("Opening L3 Zarr dataset.")
    smap_zarr = podpac.data.Zarr(source=source, datakey='Soil_Moisture_Retrieval_Data_AM_soil_moisture', file_mode='a', **kwargs)
    smap_ds = smap_zarr.dataset

    print("Creating L3 Coordinates")
    coords = smap_zarr.native_coordinates.drop('time')
    time = podpac.crange(smap_zarr.native_coordinates['time'].bounds[-1], str(datetime.date.today()), '1,D', 'time')
    coords = podpac.coordinates.merge_dims([podpac.Coordinates([time], crs=coor

    # AM Data
    print("Downloading the new L4 Data")
    smap = smap_egi.SMAP(product='SPL3SMP_E_AM', check_quality_flags=False)
    l3_am = smap.eval(coords)
    smap.set_trait('data_key', smap.quality_flag_key)
    l3_am_qf = smap.eval(coords)

    # PM Data
    smap = smap_egi.SMAP(product='SPL3SMP_E_PM', check_quality_flags=False)
    l3_pm = smap.eval(coords)
    smap.set_trait('data_key', smap.quality_flag_key)
    l3_pm_qf = smap.eval(coords)

    # replace_nans
    l3_am.set(-9999, np.isnan(l3_am))
    l3_am_qf.set(-9999, np.isnan(l3_am_qf))
    l3_pm.set(-9999, np.isnan(l3_pm))
    l3_pm_qf.set(-9999, np.isnan(l3_pm_qf))

    time_base = xr.coding.times.decode_cf_datetime(0, smap_ds['time'].attrs['units'])
    new_times = (coords.coords['time'].data - time_base).astype('timedelta64[D]')
    I = new_times > smap_ds['time'][:].max()
    old_time_shape = smap_ds['time'].shape
    old_data_shape = smap_ds['Soil_Moisture_Retrieval_Data_AM_soil_moisture'].shape
                                                               
    print ('Updating {} new times for L4 data.'.format(I.sum()))

    try:
        # Update the zarr file
        ## IMPORTANT ONLY EXECUTE THIS CELL ONCE!!!! ANY ERRORS? DO NOT EXECUTE THE SAME APPEND AGAIN!
        smap_ds['time'].append(new_times)
        smap_ds['Soil_Moisture_Retrieval_Data_AM_soil_moisture'].append(l3_am[1:], axis=0)
        smap_ds['Soil_Moisture_Retrieval_Data_AM_retrieval_qual_flag'].append(l3_am_qf[1:], axis=0)
        smap_ds['Soil_Moisture_Retrieval_Data_PM_soil_moisture_pm'].append(l3_pm[1:], axis=0)
        smap_ds['Soil_Moisture_Retrieval_Data_PM_retrieval_qual_flag_pm'].append(l3_pm_qf[1:], axis=0)
    except as e:
        print ('Updating L3 data failed:', e)
        smap_ds['time'].reshape(old_time_shape)
        smap_ds['Soil_Moisture_Retrieval_Data_AM_soil_moisture'].reshape(old_data_shape)
        smap_ds['Soil_Moisture_Retrieval_Data_AM_retrieval_qual_flag'].reshape(old_data_shape)
        smap_ds['Soil_Moisture_Retrieval_Data_PM_soil_moisture_pm'].reshape(old_data_shape)
        smap_ds['Soil_Moisture_Retrieval_Data_PM_retrieval_qual_flag_pm'].reshape(old_data_shape)
                                                               
    return

