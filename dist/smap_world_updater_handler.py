"""
PODPAC-DROUGHT-MONITOR SMAP-DATA-UPDATER AWS Handler
"""

import sys
import os
import subprocess

import boto3
import botocore

from six import string_types

def handler(event, context, source=None):
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
    bucket = 'podpac-drought-monitor-s3'

    # get dependencies path
    if "FUNCTION_DEPENDENCIES_KEY" in os.environ:
        dependencies = os.environ["FUNCTION_DEPENDENCIES_KEY"]
    else:
        dependencies = "podpac_deps_{}.zip".format(
            os.environ.get("PODPAC_VERSION", '1.2.0')
        )  # this should be equivalent to version.semver()

    # Download dependencies from specific bucket/object
    if os.path.exists("/tmp/scipy"):
        print (
            "Scipy has been detected in the /tmp/ directory. Assuming this function is hot, dependencies will"
            " not be downloaded."
        )
    elif event:
        print ("Downloading and extracting dependencies")
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
    import numpy as np

    from podpac import settings
    import podpac.datalib
    from podpac.datalib import smap_egi
    
    
    bucket = "podpac-drought-monitor-s3"
    if source is None:
        source = 's3://%s/%s' % (bucket, 'SMAP.zarr')
    

    # AM/PM Data
    print("Opening L3 Zarr dataset.")
    smap_zarr = podpac.data.Zarr(
        source=source,
        time_key='time',
        data_key='Soil_Moisture_Retrieval_Data_AM/soil_moisture',
        lat_key='lat',
        lon_key='lon',
        crs='EPSG:4326',
        nan_vals=[-9999],
        skip_validation=True,
        file_mode='a'
    )
    smap_ds = smap_zarr.dataset

    print("Creating L3 Coordinates")
    coords = smap_zarr.coordinates.drop('time')
    time = podpac.crange(smap_zarr.coordinates['time'].bounds[-1], str(datetime.date.today()), '1,D', 'time')
    coords = podpac.coordinates.merge_dims([coords, podpac.Coordinates([time], crs=coords.crs)]).transpose(*smap_zarr.dims)

    print("Downloading the new L3 Data")
    count = 0
    for c in coords.iterchunks(coords.shape[:-1] + (1, )): 
        count += 1                                                 
        if count == 1: continue  # Start is already in the dataset
        print("Download L3 Data for:", str(c['time']), '...', end='')
        try:
            # AM Data
            print("AM", end=' ')
            smap = smap_egi.SMAP(product='SPL3SMP_E_AM', check_quality_flags=False)
            l3_am = smap.eval(c)
            smap.set_trait('data_key', smap.quality_flag_key)
            smap.update_cache = True
            print("AM_QF", end=' ')
            l3_am_qf = smap.eval(c)

            # PM Data
            print("PM", end=' ')
            smap = smap_egi.SMAP(product='SPL3SMP_E_PM', check_quality_flags=False)
            l3_pm = smap.eval(c)
            smap.set_trait('data_key', smap.quality_flag_key)
            smap.update_cache = True
            print("PM_QF", end=' ')
            l3_pm_qf = smap.eval(c)
        except ValueError as e:
            print("No Granules available:", e)
            continue

        # replace_nans
        l3_am.set(-9999, podpac.UnitsDataArray(np.isnan(l3_am)))
        l3_am_qf.set(-9999, podpac.UnitsDataArray(np.isnan(l3_am_qf)))
        l3_pm.set(-9999, podpac.UnitsDataArray(np.isnan(l3_pm)))
        l3_pm_qf.set(-9999, podpac.UnitsDataArray(np.isnan(l3_pm_qf)))

        print(" ... Done.")
        new_times = c.coords['time'] 
        for i, nt in enumerate(new_times):
            if np.any((smap_ds['time'][:] - nt).astype(int) >= 0) or np.all(l3_am[..., i] == -9999) or np.all(l3_pm[..., i] == -9999):
                print('Time already exists, or is all nan -- skipping.')
                continue

            print("Updating S3 Zarr file for L3 Data.")
            old_time_shape = smap_ds['time'].shape
            old_data_shape = smap_ds[smap_zarr.data_key].shape

            print ('Old Shape:', old_data_shape)
            try:
                # Update the zarr file
                ## IMPORTANT ONLY EXECUTE THIS CELL ONCE!!!! ANY ERRORS? DO NOT EXECUTE THE SAME APPEND AGAIN!
                smap_ds['time'].append(np.atleast_1d(nt))
                smap_ds['Soil_Moisture_Retrieval_Data_AM/soil_moisture'].append(l3_am[..., i:i+1], axis=2)
                smap_ds['Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag'].append(l3_am_qf[..., i:i+1], axis=2)
                smap_ds['Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm'].append(l3_pm[..., i:i+1], axis=2)
                smap_ds['Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm'].append(l3_pm_qf[..., i:i+1], axis=2)
            except Exception as e:
                print ('Updating L3 data failed:', e)
                smap_ds['time'].resize(*old_time_shape)
                smap_ds['Soil_Moisture_Retrieval_Data_AM/soil_moisture'].resize(*old_data_shape)
                smap_ds['Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag'].resize(*old_data_shape)
                smap_ds['Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm'].resize(*old_data_shape)
                smap_ds['Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm'].resize(*old_data_shape)
            print ('New Shape:', smap_ds['Soil_Moisture_Retrieval_Data_AM/soil_moisture'].shape)
    return

#if __name__ == '__main__':
    #handler(None, None, source=r'C:\SMAP2.zarr')
    #print('Done')